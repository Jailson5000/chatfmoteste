
# Plano: Adicionar Banner de Arquivamento no Painel de Chat do Kanban

## Situação Atual

O painel de chat em **Conversas** já exibe um banner compacto para conversas arquivadas mostrando:
- Ícone de arquivo + texto "Conversa arquivada"
- Quem arquivou (Por: Nome)
- Data/hora do arquivamento
- Motivo do arquivamento

O **KanbanChatPanel** não exibe essa informação, mesmo quando a conversa selecionada está arquivada.

---

## Dados Disponíveis

O hook `useConversations` já retorna todos os campos necessários:

| Campo | Descrição |
|-------|-----------|
| `archived_at` | Data/hora do arquivamento |
| `archived_reason` | Motivo do arquivamento |
| `archived_by` | ID do usuário que arquivou |
| `archived_by_name` | Nome do usuário que arquivou |

---

## Alterações Necessárias

### 1. `KanbanChatPanel.tsx` - Adicionar Props na Interface

```typescript
interface KanbanChatPanelProps {
  // ... existing props ...
  archivedAt?: string | null;
  archivedReason?: string | null;
  archivedByName?: string | null;
}
```

### 2. `KanbanChatPanel.tsx` - Adicionar Destruturação

```typescript
export function KanbanChatPanel({
  // ... existing props ...
  archivedAt,
  archivedReason,
  archivedByName,
}: KanbanChatPanelProps) {
```

### 3. `KanbanChatPanel.tsx` - Adicionar Banner no Header

Adicionar após o header e antes das mensagens (aproximadamente linha 2900, após o header):

```tsx
{/* Archived Conversation Banner - Compact version */}
{archivedAt && (
  <div className="bg-orange-100 dark:bg-orange-900/30 border-l-4 border-orange-500 p-2 mx-3 my-1.5 rounded">
    <div className="flex items-center gap-1.5">
      <Archive className="h-3 w-3 text-orange-600 dark:text-orange-400" />
      <span className="text-xs font-medium text-orange-800 dark:text-orange-200">
        Conversa arquivada
      </span>
    </div>
    <div className="text-xs text-orange-700 dark:text-orange-300 mt-0.5">
      {archivedByName && `Por: ${archivedByName} • `}
      Em: {new Date(archivedAt).toLocaleString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      })}
    </div>
    {archivedReason && (
      <div className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
        Motivo: {archivedReason}
      </div>
    )}
  </div>
)}
```

### 4. `Kanban.tsx` - Passar Props para KanbanChatPanel

```tsx
<KanbanChatPanel
  // ... existing props ...
  archivedAt={(selectedConversation as any).archived_at}
  archivedReason={(selectedConversation as any).archived_reason}
  archivedByName={(selectedConversation as any).archived_by_name}
/>
```

---

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/kanban/KanbanChatPanel.tsx` | Adicionar props + banner de arquivamento |
| `src/pages/Kanban.tsx` | Passar props de arquivamento |

---

## Resultado Esperado

Quando uma conversa arquivada for aberta no Kanban, o usuário verá:

- Banner laranja compacto abaixo do header
- "Conversa arquivada"
- "Por: [Nome] • Em: 31/01/2026 14:30"
- "Motivo: [Razão do arquivamento]"

---

## Garantias de Segurança

- **Sem regressões**: O banner só aparece quando `archivedAt` existe
- **Retrocompatível**: Todas as novas props são opcionais
- **Dados já disponíveis**: O hook já retorna os campos
- **Mesmo visual**: Idêntico ao banner de Conversas
- **Sem alteração de lógica**: Apenas adição de componente visual
