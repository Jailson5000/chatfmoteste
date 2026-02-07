
# Plano: Arrastar Cards para Arquivados no Kanban

## Resumo

Implementar a funcionalidade de arrastar conversas de qualquer coluna para a coluna **"Arquivados"**, arquivando automaticamente a conversa com um motivo padrão.

---

## Análise Atual

| Item | Status |
|------|--------|
| Coluna de arquivados existe | ✅ Já implementada |
| Prop `isArchiveColumn={true}` | ✅ Já passada |
| `onDrop` da coluna arquivados | ❌ Apenas limpa estado, não arquiva |
| `updateConversation` disponível | ✅ Exportado pelo hook |

---

## Alterações Necessárias

### Arquivo: `src/pages/Kanban.tsx`

**1. Adicionar `updateConversation` ao hook (linha ~38-44)**

```typescript
const { 
  conversations, 
  isLoading: convsLoading, 
  updateConversationDepartment,
  updateConversation, // ← ADICIONAR
  loadMoreConversations,
  hasMoreConversations,
  isLoadingMoreConversations,
} = useConversations();
```

**2. Adicionar hook `useAuth` para obter user.id (linha ~50)**

```typescript
import { useAuth } from "@/hooks/useAuth";
// ...
const { user } = useAuth();
```

**3. Criar função `handleArchiveDrop` (após linha ~330)**

```typescript
const handleArchiveDrop = async () => {
  if (!draggedConversation) return;
  
  const conv = conversations.find(c => c.id === draggedConversation);
  if (!conv) {
    setDraggedConversation(null);
    return;
  }
  
  // Não arquivar se já estiver arquivado
  if ((conv as any).archived_at) {
    setDraggedConversation(null);
    return;
  }
  
  try {
    await updateConversation.mutateAsync({
      id: conv.id,
      archived_at: new Date().toISOString(),
      archived_reason: "Arquivado via Kanban",
      archived_by: user?.id,
    });
    
    toast({ title: "Conversa arquivada" });
  } catch (error) {
    console.error("Error archiving conversation:", error);
    toast({
      title: "Erro ao arquivar",
      description: "Não foi possível arquivar a conversa.",
      variant: "destructive",
    });
  }
  
  setDraggedConversation(null);
};
```

**4. Alterar `onDrop` da coluna de arquivados (linhas ~492 e ~567)**

```typescript
// ANTES:
onDrop={() => setDraggedConversation(null)}

// DEPOIS:
onDrop={handleArchiveDrop}
```

---

## Fluxo Visual

```text
┌─────────────────────────────────────────────────────────────────┐
│                         KANBAN BOARD                            │
├─────────────┬─────────────┬─────────────┬──────────────────────┤
│  Recepção   │  Comercial  │  Jurídico   │     Arquivados       │
├─────────────┼─────────────┼─────────────┼──────────────────────┤
│             │             │             │                      │
│  [Card A]  ─┼─────────────┼─────────────┼───→  [Card A] ✓      │
│             │             │             │                      │
│  [Card B]   │  [Card C]   │  [Card D]   │  Arquivado!          │
│             │             │             │                      │
└─────────────┴─────────────┴─────────────┴──────────────────────┘
```

---

## Arquivos Modificados

| Arquivo | Ação |
|---------|------|
| `src/pages/Kanban.tsx` | Adicionar import, destructuring, função e alterar onDrop |

---

## Comportamento

1. Usuário arrasta um card de qualquer departamento
2. Solta na coluna "Arquivados"
3. Sistema arquiva com:
   - `archived_at`: Data/hora atual
   - `archived_reason`: "Arquivado via Kanban"
   - `archived_by`: ID do usuário atual
4. Card move para a coluna de arquivados
5. Toast confirma a ação

---

## Impacto

| Aspecto | Avaliação |
|---------|-----------|
| Risco | **BAIXO** - Usa mutation existente |
| Performance | **NENHUM** - Operação pontual |
| Reversibilidade | **SIM** - Desarquivar funciona igual |
