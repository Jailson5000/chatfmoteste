
# Plano: Corrigir Reações de Cliente no Kanban

## Status: ✅ CONCLUÍDO

---

## Alterações Realizadas

### 1. Hook - `src/hooks/useMessagesWithPagination.tsx`
- ✅ Adicionado `client_reaction?: string | null` na interface `PaginatedMessage`
- ✅ Adicionado `client_reaction` nas queries SELECT (inicial e loadMore)

### 2. Kanban - `src/components/kanban/KanbanChatPanel.tsx`
- ✅ Passada prop `clientReaction={msg.client_reaction}` para MessageBubble

---

## Validações

- [x] Hook busca `client_reaction` do banco
- [x] Kanban passa prop para MessageBubble
- [x] Realtime já estava configurado (tabela `messages`)
- [x] Conversas.tsx continua funcionando (não alterado)
