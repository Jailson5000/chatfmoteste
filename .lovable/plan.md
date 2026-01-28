
# Handoff Automático: Mensagem Externa do WhatsApp Desativa a IA

## Problema Identificado

Quando um **atendente envia uma mensagem diretamente pelo WhatsApp** (pelo celular físico, fora do sistema MiauChat), essa mensagem chega via webhook com `fromMe = true`. Atualmente, o sistema salva a mensagem mas **não faz nenhuma alteração no handler da conversa** - a IA continua ativa e pode responder logo em seguida, causando confusão.

## Comportamento Desejado

Quando uma mensagem `fromMe = true` (externa) chega via webhook:

1. **Verificar** se a conversa está sendo atendida pela IA (`current_handler = 'ai'`)
2. **Se sim:**
   - Definir `current_handler = 'human'`
   - Definir `assigned_to = null` (sem responsável → vai para a fila)
   - Definir `current_automation_id = null` (desativar IA)
3. **Resultado:** Conversa aparece na aba "Fila" sem responsável atribuído

## Solução Técnica

### Arquivo: `supabase/functions/evolution-webhook/index.ts`

**Localização:** Após salvar a mensagem (linha ~4273) e antes de construir `updatePayload` (linha ~4287)

**Lógica a adicionar:**

```text
// ========================================================================
// HANDOFF AUTOMÁTICO: Mensagem externa do atendente desativa a IA
// ========================================================================
// Quando um atendente envia mensagem DIRETAMENTE pelo WhatsApp (fora do sistema),
// isso é interpretado como uma interferência manual na conversa.
// Se a conversa estava com a IA, devemos:
// 1. Desativar a IA (current_automation_id = null)
// 2. Remover responsável (assigned_to = null) → vai para a fila
// 3. Definir handler como humano
// ========================================================================
if (isFromMe && conversation.current_handler === 'ai') {
  logDebug('HANDOFF', `External message from attendant detected - disabling AI and moving to queue`, {
    requestId,
    conversationId: conversation.id,
    previousAutomation: conversation.current_automation_id,
  });
  
  // Override the handler to human and remove both AI and human assignment
  updatePayload.current_handler = 'human';
  updatePayload.current_automation_id = null;
  updatePayload.assigned_to = null;
}
```

**Fluxo detalhado:**

```text
┌─────────────────────────────────────────────────────────────────┐
│                    WEBHOOK: messages.upsert                     │
│                        (fromMe = true)                          │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Mensagem é salva no banco                      │
│               (is_from_me = true, sender_type = 'system')       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│          A conversa está com IA? (current_handler = 'ai')       │
└─────────────────────────────────────────────────────────────────┘
                          │           │
                   SIM    │           │   NÃO
                          ▼           ▼
     ┌────────────────────────────┐   ┌─────────────────────────────┐
     │ HANDOFF AUTOMÁTICO:        │   │ Nenhuma alteração no handler│
     │ • current_handler = human  │   │ (já está com humano ou na   │
     │ • assigned_to = null       │   │  fila)                      │
     │ • current_automation_id =  │   └─────────────────────────────┘
     │   null                     │
     │ • Conversa → FILA          │
     └────────────────────────────┘
```

### Detalhes da Implementação

**Arquivo:** `supabase/functions/evolution-webhook/index.ts`

**Linha aproximada:** ~4285 (antes de construir o `updatePayload`)

**Alteração:** Inserir a lógica de handoff automático

```typescript
// Existing code around line 4275-4290:
if (msgError) {
  logDebug('ERROR', `Failed to save message`, { requestId, error: msgError, code: msgError.code });
} else {
  logDebug('MESSAGE', `Message saved successfully`, { requestId, dbMessageId: savedMessage?.id, whatsappId: data.key.id });
}

// ========================================================================
// NEW: HANDOFF AUTOMÁTICO - Mensagem externa do atendente desativa a IA
// ========================================================================
// Quando um atendente envia mensagem DIRETAMENTE pelo WhatsApp (fora do sistema),
// isso indica que ele quer assumir o atendimento manualmente.
// Se a conversa estava com a IA, devemos:
// 1. Desativar a IA
// 2. Mover para a fila (sem responsável atribuído)
// ========================================================================
let externalHandoffApplied = false;
if (isFromMe && conversation.current_handler === 'ai') {
  externalHandoffApplied = true;
  logDebug('HANDOFF', `External WhatsApp message from attendant detected - disabling AI and moving to queue`, {
    requestId,
    conversationId: conversation.id,
    previousHandler: conversation.current_handler,
    previousAutomationId: conversation.current_automation_id,
    previousAssignedTo: conversation.assigned_to,
  });
}

// Update conversation last_message_at
// ... existing code ...

const updatePayload: Record<string, unknown> = {
  last_message_at: new Date().toISOString(),
  contact_name: shouldUpdateContactName ? data.pushName : conversation.contact_name,
};

// Apply handoff if external message detected
if (externalHandoffApplied) {
  updatePayload.current_handler = 'human';
  updatePayload.current_automation_id = null;
  updatePayload.assigned_to = null;
  
  logDebug('HANDOFF', `Handoff applied - conversation moved to queue`, {
    requestId,
    conversationId: conversation.id,
  });
}
```

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Atendente envia msg pelo WhatsApp enquanto IA está ativa | IA continua respondendo | Conversa vai para Fila, IA desativada |
| Atendente envia msg pelo sistema (Painel) | Handler já é 'human' | Sem mudança (já estava correto) |
| Cliente envia msg para IA | IA processa normalmente | Sem mudança (funciona como antes) |

## Verificação de Não-Regressão

A alteração só afeta o cenário específico:
- `isFromMe = true` (mensagem enviada, não recebida)
- `conversation.current_handler = 'ai'` (conversa estava com IA)

Não afeta:
- Mensagens recebidas do cliente (`isFromMe = false`)
- Conversas já com humano (`current_handler = 'human'`)
- Envio de mensagens pelo painel (que já marca como `human` antes de enviar)
- Arquivamento/desarquivamento
- Transcrição de áudio
- Processamento de IA

## Risco

**Baixo** - A alteração é cirúrgica e só modifica o `updatePayload` quando as duas condições são verdadeiras.
