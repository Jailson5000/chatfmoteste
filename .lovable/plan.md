

# Diagnóstico: Mensagens Perdidas no UAZAPi Webhook

## Causa raiz identificada

O bug está na **linha 361** do `uazapi-webhook/index.ts`:

```typescript
const rawEvent = body.event || body.type || body.EventType || "unknown";
```

O UAZAPi envia payloads onde:
- `body.EventType` = `"messages"` (string correta)  
- `body.event` = `{ Chat: "...", IsFromMe: false, ... }` (objeto com dados do evento)

Como `body.event` é um **objeto truthy**, ele é capturado primeiro. `String({...}).toLowerCase()` resulta em `"[object object]"`, que **não entra em nenhum case** do switch e cai no `default` ("Unhandled event"). A mensagem é completamente descartada.

Isso é confirmado pelos logs: os eventos aparecem como `Event: [object object]` — exatamente este bug. Para `messages_update`, o efeito era inofensivo (já era ignorado). Mas para eventos `messages`, **a mensagem inteira é perdida**.

A conversa é criada porque o UAZAPi também envia um evento `chats` separado (com `body.EventType = "chats"`, sem `body.event` como objeto), que cai no `default` mas depois que o evento `messages` já tentou e falhou. Na verdade, a conversa foi criada por um evento `messages` anterior que **funcionou** (quando `body.event` era string ou ausente), e os subsequentes falharam.

## Correção

### Arquivo: `supabase/functions/uazapi-webhook/index.ts` (linha 361)

Inverter a prioridade: usar `body.EventType` (string confiável da UAZAPi) **antes** de `body.event`, e validar que o valor selecionado é realmente uma string:

```typescript
// ANTES (bugado):
const rawEvent = body.event || body.type || body.EventType || "unknown";

// DEPOIS (corrigido):
const rawEvent = body.EventType || body.type || 
  (typeof body.event === "string" ? body.event : null) || "unknown";
```

Essa mudança:
1. Prioriza `body.EventType` (campo padrão da UAZAPi, sempre string)
2. Usa `body.type` como segundo fallback
3. Só usa `body.event` se for **string** (ignora quando é objeto)
4. Garante que o evento `messages` será corretamente roteado para o case handler

### Impacto

| Antes | Depois |
|---|---|
| Eventos `messages` com `body.event` como objeto → `[object object]` → `default` (descartado) | Eventos `messages` → lidos de `body.EventType` → case `"messages"` (processado) |
| Mensagens perdidas silenciosamente | Todas as mensagens capturadas |

Nenhuma outra mudança necessária. O restante do pipeline (criação de conversa, inserção de mensagem, IA) já funciona — o problema era exclusivamente no roteamento do evento.

