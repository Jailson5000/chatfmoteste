

# Correcoes: Alerta Sonoro + Desarquivamento Automatico

## Diagnostico

### Problema 1: Conversa arquivada nao desarquiva ao receber mensagem

**Causa raiz confirmada:** O `uazapi-webhook` NAO tem logica de desarquivamento. Quando uma mensagem chega de um contato cuja conversa esta arquivada:
1. O webhook encontra a conversa (Step 1 — sem filtro de `archived_at`)
2. Salva a mensagem corretamente
3. Atualiza `last_message_at`
4. **MAS nunca limpa `archived_at`** → conversa continua aparecendo como arquivada

O `evolution-webhook` tem ~40 linhas de logica de desarquivamento (linhas 5808-5849) que:
- Detecta `conversation.archived_at !== null`
- Limpa `archived_at` e `archived_reason`
- Restaura o handler correto (`archived_next_responsible_type/id`)
- Ou usa defaults da instancia se nao ha proximo responsavel definido

Essa logica esta **completamente ausente** no `uazapi-webhook`.

### Problema 2: Alerta sonoro sumiu

**Causa raiz:** O som depende de `useMessageNotifications` → `RealtimeSyncContext` → callback de mensagens → verifica `conversation.current_handler` e `conversation.assigned_to` no cache do React Query.

O fluxo funciona assim:
1. Mensagem INSERT chega via Realtime
2. `handleNewMessage` busca a conversa no cache: `queryClient.getQueryData(["conversations", lawFirmId])`
3. Se `conversation.current_handler === 'ai'` → **NAO toca som**

**Problema:** Quando o uazapi-webhook encontra a conversa arquivada e nao desarquiva, o campo `current_handler` pode ainda estar como `'ai'` (da ultima sessao). O cache local reflete isso. Resultado: o filtro `if (conversation?.current_handler === 'ai') return;` bloqueia o som.

Alem disso, a conversa da Gabrielle Martins no screenshot mostra que foi atribuida a "Jailson Ferreira" (`assigned_to` definido). O `useMessageNotifications` verifica: `if (conversation.assigned_to !== user?.id) return;` — ou seja, se o usuario logado NAO e o Jailson, ele nao ouve o som.

**Mas o problema principal e que conversas novas de contatos novos (sem cache) tambem podem nao tocar som**, porque `cachedData?.find()` retorna `undefined`, e o codigo continua sem tocar (nao ha `if (!conversation)` para notificar em caso de conversa nao encontrada no cache).

## Correcoes Propostas

### Arquivo 1: `supabase/functions/uazapi-webhook/index.ts`

**Mudanca A — Logica de desarquivamento (CRITICO):**

Na secao de "Update conversation" (linhas 1101-1113), ANTES de fazer o update, buscar o estado completo da conversa (incluindo `archived_at`, `archived_next_responsible_type/id`, `current_handler`) e aplicar a mesma logica do evolution-webhook:

```text
// Buscar estado da conversa para verificar se esta arquivada
const { data: convState } = await supabaseClient
  .from("conversations")
  .select("archived_at, archived_reason, archived_next_responsible_type, archived_next_responsible_id, current_handler, current_automation_id, assigned_to, client_id")
  .eq("id", conversationId)
  .single();

if (convState?.archived_at && !isFromMe) {
  // Desarquivar
  convUpdate.archived_at = null;
  convUpdate.archived_reason = null;
  
  // Restaurar handler
  if (convState.archived_next_responsible_type === 'ai' && convState.archived_next_responsible_id) {
    convUpdate.current_handler = 'ai';
    convUpdate.current_automation_id = convState.archived_next_responsible_id;
    convUpdate.assigned_to = null;
  } else if (convState.archived_next_responsible_type === 'human' && convState.archived_next_responsible_id) {
    convUpdate.current_handler = 'human';
    convUpdate.assigned_to = convState.archived_next_responsible_id;
    convUpdate.current_automation_id = null;
  } else {
    // Defaults da instancia
    if (instance.default_automation_id) {
      convUpdate.current_handler = 'ai';
      convUpdate.current_automation_id = instance.default_automation_id;
      convUpdate.assigned_to = null;
    } else if (instance.default_assigned_to) {
      convUpdate.current_handler = 'human';
      convUpdate.assigned_to = instance.default_assigned_to;
    } else {
      convUpdate.current_handler = 'human';
      convUpdate.assigned_to = null;
      convUpdate.current_automation_id = null;
    }
  }
  
  // Limpar metadata de arquivo
  convUpdate.archived_next_responsible_type = null;
  convUpdate.archived_next_responsible_id = null;
}
```

**Mudanca B — Busca prioriza conversas ativas sobre arquivadas:**

No Step 1 (linha 623), adicionar filtro `is('archived_at', null)` como prioridade, e se nao encontrar, buscar arquivadas (excluindo `instance_unification`). Isso evita que mensagens caiam em conversas permanentemente inativas.

### Arquivo 2: `src/hooks/useMessageNotifications.tsx`

**Mudanca C — Tocar som quando conversa nao esta no cache (MEDIO):**

No `handleNewMessage`, quando `conversation` e `undefined` (conversa nova ou nao carregada no cache), o som deve tocar. Adicionar:

```typescript
// Se conversa nao esta no cache, e provavelmente uma conversa nova ou recem-ativada
// Tocar som para alertar
if (!conversation) {
  if (soundEnabled) playNotification();
  if (browserEnabled && "Notification" in window && Notification.permission === "granted") {
    new Notification("Nova mensagem do WhatsApp", { ... });
  }
  onNewMessage?.(message);
  return;
}
```

Isso resolve o caso de conversas que acabaram de ser desarquivadas e ainda nao estao no cache local.

## Resumo de Mudancas

| Arquivo | Mudanca | Prioridade |
|---|---|---|
| `uazapi-webhook/index.ts` | Adicionar logica de desarquivamento automatico ao receber mensagem | CRITICO |
| `uazapi-webhook/index.ts` | Priorizar conversas ativas sobre arquivadas na busca | ALTO |
| `useMessageNotifications.tsx` | Tocar som quando conversa nao esta no cache (conversa nova/reativada) | ALTO |

## Resultado Esperado

- Conversas arquivadas desarquivam automaticamente ao receber nova mensagem do cliente
- Handler correto e restaurado (IA ou humano) conforme configuracao de proximo responsavel
- Alerta sonoro toca mesmo para conversas que acabaram de ser criadas ou reativadas
- Vinculacao de conversas antigas continua funcionando normalmente (os 5 steps de lookup nao sao alterados)

