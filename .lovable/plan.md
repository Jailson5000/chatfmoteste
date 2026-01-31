
# Plano: Adicionar Fotos de Contatos no Kanban e Conversas

## Situação Atual

### ✅ Conversas (Lista Lateral) - JÁ FUNCIONA!
- O `ConversationSidebarCard` **já exibe** a foto do contato (`avatarUrl`)
- O `useConversationMapping.tsx` **já passa** o `client.avatar_url`
- Nenhuma alteração necessária aqui!

### ❌ Kanban - PRECISA DE AJUSTE
- O `KanbanCard` usa **Dicebear** (avatar gerado) em vez da foto real
- A interface não inclui `avatar_url` do cliente
- O hook `useConversations` **já retorna** `client.avatar_url`, mas não é passado para o componente

---

## Arquitetura de Dados

O fluxo de dados do avatar já existe:

```text
Database (clients.avatar_url)
        ↓
useConversations hook (client.avatar_url ✓)
        ↓
Kanban.tsx passa conversations para KanbanColumn
        ↓
KanbanColumn passa para KanbanCard
        ↓
❌ KanbanCard ignora avatar_url e usa Dicebear
```

---

## Alterações Necessárias

### 1. `KanbanColumn.tsx` - Atualizar Interface

Adicionar `avatar_url` à interface `Conversation.client`:

```typescript
interface Conversation {
  // ... existing fields ...
  client?: { 
    custom_status_id?: string | null;
    avatar_url?: string | null;  // NEW
  } | null;
  // ...
}
```

### 2. `KanbanCard.tsx` - Usar Avatar Real

**Atualizar interface:**
```typescript
interface KanbanCardProps {
  conversation: {
    // ... existing fields ...
    client?: { 
      custom_status_id?: string | null;
      avatar_url?: string | null;  // NEW
    } | null;
    // ...
  };
}
```

**Atualizar renderização do Avatar (linha 237-242):**
```tsx
<Avatar className="h-8 w-8 border border-success/30">
  {conversation.client?.avatar_url ? (
    <AvatarImage 
      src={conversation.client.avatar_url} 
      alt={conversation.contact_name || "Avatar"} 
    />
  ) : null}
  <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
    {getInitials(conversation.contact_name)}
  </AvatarFallback>
</Avatar>
```

---

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/kanban/KanbanColumn.tsx` | Adicionar `avatar_url` na interface `Conversation.client` |
| `src/components/kanban/KanbanCard.tsx` | Adicionar `avatar_url` na interface + usar no Avatar |

---

## Resultado Esperado

### Antes (Kanban)
- Avatar mostra iniciais geradas pelo Dicebear (ex: "JF", "GM")
- Todos os avatares são iguais se o nome for igual

### Depois (Kanban)
- Avatar mostra foto do WhatsApp quando disponível
- Fallback para iniciais quando foto não existe
- Mesmo comportamento visual que a lista de Conversas

---

## Impacto em Outros Componentes

- ✅ **Nenhum** - Os dados já são passados corretamente pelo `useConversations`
- ✅ **Retrocompatível** - O campo `avatar_url` é opcional, fallback para iniciais
- ✅ **Sem regressões** - Apenas adicionamos uso de um campo existente

---

## Nota Técnica

O `useConversations` hook já retorna `client.avatar_url` (linha 101-102 do hook), e o Kanban já recebe as conversas completas. A única alteração necessária é atualizar as interfaces TypeScript e usar o campo no componente de renderização.
