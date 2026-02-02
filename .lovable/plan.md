
# Plano: Corrigir Reações de Cliente no Kanban

## Diagnóstico

A implementação anterior adicionou suporte a `clientReaction` apenas na página de **Conversas**, mas o **Kanban** usa um fluxo de dados diferente e ficou incompleto.

---

## Situação Atual

| Local | Status | Problema |
|-------|--------|----------|
| **Conversations.tsx** | ✅ Funciona | Passa `clientReaction` para MessageBubble |
| **KanbanChatPanel.tsx** | ❌ Não funciona | Não passa `clientReaction` para MessageBubble |
| **useMessagesWithPagination.tsx** | ❌ Incompleto | Query não busca `client_reaction` do banco |

---

## Arquivos a Modificar

| Arquivo | Descrição |
|---------|-----------|
| `src/hooks/useMessagesWithPagination.tsx` | Adicionar `client_reaction` na interface e nas queries |
| `src/components/kanban/KanbanChatPanel.tsx` | Passar prop `clientReaction` para MessageBubble |

---

## Solução

### 1. Hook - Adicionar campo `client_reaction`

**Arquivo:** `src/hooks/useMessagesWithPagination.tsx`

**Interface PaginatedMessage (linha ~26):**
```typescript
my_reaction?: string | null;
client_reaction?: string | null; // ← ADICIONAR
```

**Query inicial (linha ~147):**
```typescript
.select("id, content, ..., my_reaction, client_reaction") // ← ADICIONAR
```

**Query loadMore (linha ~225):**
```typescript
.select("id, content, ..., my_reaction, client_reaction") // ← ADICIONAR
```

### 2. Kanban - Passar prop para MessageBubble

**Arquivo:** `src/components/kanban/KanbanChatPanel.tsx`

**Na renderização do MessageBubble (linha ~3148):**
```tsx
<MessageBubble
  // ... outras props ...
  myReaction={msg.my_reaction}
  clientReaction={msg.client_reaction}  // ← ADICIONAR
  onReply={handleReply}
  // ...
/>
```

---

## Fluxo Após Correção

```text
┌─────────────────────────────────────────────────────────────────────┐
│                       Banco de Dados                                 │
│  messages: { ..., client_reaction: '👍' }                            │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
           ┌──────────────────────┴──────────────────────┐
           │                                              │
           ▼                                              ▼
┌──────────────────────────┐                ┌──────────────────────────┐
│  Conversations.tsx       │                │  useMessagesWithPagination│
│  (Query própria ✅)       │                │  (Adicionar campo ✅)     │
└──────────────────────────┘                └──────────────────────────┘
           │                                              │
           ▼                                              ▼
┌──────────────────────────┐                ┌──────────────────────────┐
│  MessageBubble           │                │  KanbanChatPanel.tsx     │
│  clientReaction={...} ✅  │                │  Passar prop ✅           │
└──────────────────────────┘                └──────────────────────────┘
```

---

## Risco de Quebrar o Sistema

**Mínimo:**

1. **Hook**: Apenas adiciona campo na interface e query - campos existentes não são afetados
2. **Kanban**: Apenas adiciona mais uma prop - não altera comportamento existente
3. **Realtime**: O hook já escuta mudanças na tabela `messages` - atualizações de `client_reaction` serão propagadas automaticamente

---

## Validações Pós-Implementação

- [ ] Abrir conversa no Kanban → ver reação do cliente se existir
- [ ] Cliente reagir em tempo real → emoji aparece no Kanban
- [ ] Conversa no painel Conversas continua funcionando
- [ ] Mensagens antigas com reações aparecem corretamente
