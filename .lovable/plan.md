
# Plano: Adicionar Foto do Contato no Header do Painel de Chat do Kanban

## Situação Atual

O header do `KanbanChatPanel` exibe um avatar gerado pelo **Dicebear** baseado nas iniciais do nome:

```tsx
// Linhas 2703-2710 - Código atual
<Avatar className="h-10 w-10">
  <AvatarImage
    src={`https://api.dicebear.com/7.x/initials/svg?seed=${contactName || contactPhone}`}
  />
  <AvatarFallback>
    {contactName?.charAt(0)?.toUpperCase() || "?"}
  </AvatarFallback>
</Avatar>
```

O `avatar_url` **já está disponível** via `selectedConversation.client?.avatar_url` no Kanban.tsx (linha 605), mas não é passado para o componente.

---

## Alterações Necessárias

### 1. `KanbanChatPanel.tsx` - Adicionar Prop

**Interface (linhas 1007-1032):**
```typescript
interface KanbanChatPanelProps {
  // ... existing props ...
  avatarUrl?: string | null;  // NEW
}
```

**Destruturação (linha 1034-1055):**
```typescript
export function KanbanChatPanel({
  // ... existing props ...
  avatarUrl,  // NEW
}: KanbanChatPanelProps) {
```

### 2. `KanbanChatPanel.tsx` - Usar Foto Real no Avatar

**Header (linhas 2703-2710):**
```tsx
<Avatar className="h-10 w-10 border border-primary/20">
  {avatarUrl ? (
    <AvatarImage 
      src={avatarUrl} 
      alt={contactName || "Avatar"} 
    />
  ) : null}
  <AvatarFallback className="bg-primary/10 text-primary">
    {contactName?.charAt(0)?.toUpperCase() || "?"}
  </AvatarFallback>
</Avatar>
```

### 3. `Kanban.tsx` - Passar Avatar URL

**Linha 594-618 (onde KanbanChatPanel é chamado):**
```tsx
<KanbanChatPanel
  // ... existing props ...
  avatarUrl={selectedConversation.client?.avatar_url}
/>
```

---

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/kanban/KanbanChatPanel.tsx` | Adicionar prop `avatarUrl` + usar no Avatar do header |
| `src/pages/Kanban.tsx` | Passar `client?.avatar_url` para KanbanChatPanel |

---

## Resultado Esperado

- **Com foto**: Exibe a foto do WhatsApp do contato no header
- **Sem foto**: Fallback para a inicial do nome (mesmo visual atual, sem Dicebear)
- **Estilo**: Mantém tamanho 10x10 (40px), adiciona borda sutil para harmonizar

---

## Garantias de Segurança

- **Sem regressões**: O fallback para iniciais mantém o comportamento visual atual
- **Retrocompatível**: O campo `avatarUrl` é opcional na interface
- **Dados já disponíveis**: `useConversations` já retorna `client.avatar_url`
- **Sem alteração de lógica**: Apenas mudança visual no header
- **Remove dependência externa**: Não usa mais Dicebear API (avatar gerado localmente)
