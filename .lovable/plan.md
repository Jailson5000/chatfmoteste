
# Plano: Exibir Reações de Clientes nas Mensagens

## Diagnóstico

Quando o cliente reage a uma mensagem do atendente (ex: reage com 👍), o sistema:
1. **Recebe** o evento `messages.reaction` da Evolution API ✅
2. **Ignora** porque não há tratamento no webhook ❌
3. **Não exibe** porque não há coluna no banco nem UI ❌

---

## Situação Atual

| Componente | Status |
|------------|--------|
| Coluna `my_reaction` | ✅ Existe (reação que EU envio para mensagem do cliente) |
| Coluna `client_reaction` | ❌ Não existe (reação que CLIENTE envia para minha mensagem) |
| Webhook `messages.reaction` | ❌ Evento não é tratado |
| UI para exibir reação do cliente | ❌ Não implementado |

---

## Arquivos a Modificar

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| Migração SQL | Database | Adicionar coluna `client_reaction` na tabela `messages` |
| `supabase/functions/evolution-webhook/index.ts` | Backend | Processar evento `messages.reaction` |
| `src/components/conversations/MessageBubble.tsx` | Frontend | Exibir reação do cliente no balão |
| `src/pages/Conversations/index.tsx` | Frontend | Passar prop `clientReaction` para MessageBubble |

---

## Estrutura do Evento (Evolution API)

Quando um cliente reage a uma mensagem, a Evolution API envia:

```json
{
  "event": "messages.reaction",
  "instance": "FMOANTIGO63",
  "data": {
    "key": {
      "id": "3EB09ABC1234567890",
      "remoteJid": "5517996001254@s.whatsapp.net",
      "fromMe": false
    },
    "reaction": {
      "text": "👍",
      "key": {
        "id": "3EB09ABC1234567890",
        "fromMe": true,
        "remoteJid": "5517996001254@s.whatsapp.net"
      }
    }
  }
}
```

**Campos importantes:**
- `data.reaction.text` → O emoji da reação (ex: "👍")
- `data.reaction.key.id` → ID da mensagem que foi reagida
- `data.reaction.key.fromMe` → `true` se a mensagem reagida foi enviada por nós
- `data.key.fromMe` → `false` indica que a reação veio do cliente

---

## Solução

### 1. Migração - Adicionar Coluna

```sql
-- Adicionar coluna para reação do cliente
ALTER TABLE messages 
ADD COLUMN client_reaction text;

-- Comentário explicativo
COMMENT ON COLUMN messages.client_reaction IS 
  'Emoji reaction sent by the client on this outgoing message';
```

### 2. Webhook - Processar Evento

Adicionar no switch de eventos do `evolution-webhook/index.ts`:

```typescript
case 'messages.reaction': {
  // data.reaction.key.id = ID da mensagem que foi reagida
  // data.reaction.text = Emoji da reação (ou vazio para remover)
  // data.key.fromMe = false significa que o cliente reagiu
  
  const reactionData = body.data;
  const reactedMessageId = reactionData?.reaction?.key?.id;
  const emoji = reactionData?.reaction?.text || null;
  const reacterIsClient = reactionData?.key?.fromMe === false;
  const reactedMessageIsFromMe = reactionData?.reaction?.key?.fromMe === true;
  
  if (!reactedMessageId) {
    logDebug('REACTION', 'Missing reacted message ID', { requestId });
    break;
  }
  
  // Cliente reagiu à minha mensagem → salvar em client_reaction
  if (reacterIsClient && reactedMessageIsFromMe) {
    const { error: updateError } = await supabaseClient
      .from('messages')
      .update({ client_reaction: emoji })
      .eq('whatsapp_message_id', reactedMessageId)
      .eq('is_from_me', true);
    
    if (updateError) {
      logDebug('REACTION', 'Failed to update client reaction', { 
        requestId, 
        error: updateError 
      });
    } else {
      logDebug('REACTION', 'Client reaction saved', { 
        requestId, 
        messageId: reactedMessageId, 
        emoji 
      });
    }
  }
  break;
}
```

### 3. Frontend - Exibir Reação

**MessageBubble.tsx:**

Adicionar prop `clientReaction` e exibir abaixo do balão:

```tsx
// Na interface MessageBubbleProps
clientReaction?: string | null; // Emoji reaction received from client

// Na renderização (apenas para mensagens fromMe)
{isFromMe && clientReaction && (
  <div className="absolute -bottom-2 -left-1 bg-muted rounded-full px-1.5 py-0.5 border shadow-sm text-sm">
    {clientReaction}
  </div>
)}
```

**Resultado visual:**

```text
┌──────────────────────────────────────┐
│  *Jailson Ferreira* - Advogado       │
│  Ótima tarde pro senhor.             │
│                              16:52 ✓✓│
└──────────────────────────────────────┘
         👍  ← Reação do cliente (como bolinha)
```

---

## Fluxo de Dados

```text
┌─────────────────────────────────────────────────────────────────────┐
│              WhatsApp (Cliente reage com 👍)                         │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ messages.reaction event
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Evolution API                                    │
│           Webhook: messages.reaction                                 │
│           Payload: { reaction: { text: "👍", key: {...} } }         │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              evolution-webhook Edge Function                         │
│  - Detecta messages.reaction                                         │
│  - Verifica: cliente reagiu à minha mensagem?                        │
│  - UPDATE messages SET client_reaction = '👍'                        │
│    WHERE whatsapp_message_id = 'xxx' AND is_from_me = true           │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ UPDATE
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Supabase DB                                   │
│  messages: { ..., client_reaction: '👍' }                            │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ Realtime
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              MessageBubble.tsx (Frontend)                            │
│  - Recebe prop clientReaction                                        │
│  - Exibe emoji como bolinha abaixo do balão                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Risco de Quebrar o Sistema

**Baixo risco:**

1. **Migração SQL**: Apenas adiciona nova coluna nullable - não afeta dados existentes
2. **Webhook**: Adiciona novo `case` no switch - não afeta outros eventos
3. **Frontend**: Adiciona renderização condicional - não afeta quando `clientReaction` é null/undefined
4. **Realtime**: Tabela `messages` já está no realtime - atualizações serão propagadas automaticamente

---

## Considerações Especiais

1. **Remover reação**: Quando cliente remove reação, `reaction.text` vem vazio - salvamos como `null`
2. **Múltiplas reações**: WhatsApp permite apenas 1 reação por pessoa - a última sobrescreve
3. **Reações em mensagens antigas**: Funciona porque o UPDATE usa `whatsapp_message_id`
4. **Sem impacto na IA**: O agente não recebe/processa reações como mensagens

---

## Validações Pós-Implementação

- [ ] Cliente reage com 👍 → emoji aparece no balão
- [ ] Cliente remove reação → emoji desaparece
- [ ] Cliente troca reação de 👍 para ❤️ → atualiza no balão
- [ ] Reação em mensagem antiga → funciona corretamente
- [ ] Mensagens existentes continuam funcionando
- [ ] Realtime propaga a atualização sem refresh

