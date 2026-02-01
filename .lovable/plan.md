
# Plano: Corrigir "Intervenção pontual" não aparecendo no Kanban

## Problema Identificado

Na tela de **Conversas**, a mensagem de "Intervenção pontual" é exibida corretamente com a label amarela e ícone ⚡. No **Kanban**, a mesma mensagem aparece sem a label "Intervenção pontual" no topo.

## Causa Raiz

Ao comparar os dois arquivos, encontrei a diferença:

| Arquivo | Linha | Parâmetro `isPontual` |
|---------|-------|-----------------------|
| `Conversations.tsx` | 1416 | ✅ `isPontual: wasPontualMode` |
| `KanbanChatPanel.tsx` | 1827-1834 | ❌ **Falta o parâmetro** |

**Código no Conversations.tsx (correto):**
```typescript
const response = await supabase.functions.invoke("evolution-api", {
  body: {
    action: "send_message_async",
    conversationId: conversationId,
    message: messageToSend,
    replyToWhatsAppMessageId: replyWhatsAppId,
    replyToMessageId: replyMessage?.id || null,
    isPontual: wasPontualMode, // ✅ Presente
  },
});
```

**Código no KanbanChatPanel.tsx (faltando):**
```typescript
const response = await supabase.functions.invoke("evolution-api", {
  body: {
    action: "send_message_async",
    conversationId,
    message: messageToSend,
    replyToWhatsAppMessageId: replyWhatsAppId,
    replyToMessageId: replyToId,
    // ❌ isPontual está FALTANDO aqui
  },
});
```

A edge function `evolution-api` já está preparada para receber `isPontual` e salvá-lo no banco (linha 1676), mas o Kanban simplesmente não está enviando.

---

## Solução

Adicionar `isPontual: wasPontualMode` na chamada da Evolution API no KanbanChatPanel.

| Arquivo | Linha | Alteração |
|---------|-------|-----------|
| `src/components/kanban/KanbanChatPanel.tsx` | 1827-1834 | Adicionar `isPontual: wasPontualMode` |

**Antes (linha 1827-1834):**
```typescript
const response = await supabase.functions.invoke("evolution-api", {
  body: {
    action: "send_message_async",
    conversationId,
    message: messageToSend,
    replyToWhatsAppMessageId: replyWhatsAppId,
    replyToMessageId: replyToId,
  },
});
```

**Depois:**
```typescript
const response = await supabase.functions.invoke("evolution-api", {
  body: {
    action: "send_message_async",
    conversationId,
    message: messageToSend,
    replyToWhatsAppMessageId: replyWhatsAppId,
    replyToMessageId: replyToId,
    isPontual: wasPontualMode, // Marcar como intervenção pontual
  },
});
```

---

## Fluxo da Correção

```text
                     ┌─────────────────────┐
                     │  Usuário clica ⚡   │
                     │  (Modo Pontual ON)  │
                     └──────────┬──────────┘
                                │
                     ┌──────────▼──────────┐
                     │  Envia mensagem     │
                     │  wasPontualMode=true│
                     └──────────┬──────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
    ┌────▼────┐           ┌─────▼─────┐         ┌──────▼──────┐
    │Conversa │           │ Kanban    │         │ Mensagem    │
    │Otimista │           │ Otimista  │         │ Otimista    │
    │is_pontual│          │is_pontual │         │ exibida     │
    │= true ✅│           │= true ✅  │         │ c/ label ⚡ │
    └────┬────┘           └─────┬─────┘         └──────┬──────┘
         │                      │                      │
         │                      │                      │
    ┌────▼────────────────┬─────▼───────────────┐      │
    │      Evolution API  │                     │      │
    │      (edge function)│                     │      │
    └──────────┬──────────┴─────────────────────┘      │
               │                                       │
    ┌──────────▼──────────┐                            │
    │ Salva no DB         │                            │
    │ is_pontual = true   │◄───────────────────────────┘
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │ Webhook Realtime    │
    │ Atualiza mensagem   │
    │ mantém is_pontual   │
    └─────────────────────┘
```

---

## Impacto

- **Seguro**: Alteração de 1 linha em 1 arquivo
- **Sem regressão**: Não afeta nenhuma outra funcionalidade
- **Isolado**: Apenas adiciona parâmetro que já é esperado pela API

## Resultado Esperado

Após a correção:
1. No Kanban, ao ativar modo pontual (⚡) e enviar mensagem
2. A mensagem exibirá a label "⚡ Intervenção pontual" no topo do balão
3. Comportamento idêntico à tela de Conversas
