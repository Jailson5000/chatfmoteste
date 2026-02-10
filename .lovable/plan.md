
# Correcao: Kanban - Departamento nao fecha + Arquivo nao atualiza

## Problemas

### 1. Painel fecha ao trocar departamento
Na linha 2685 do `KanbanChatPanel.tsx`, `onClose()` e chamado no `onSuccess` do `handleDepartmentChange`. O usuario quer que o painel continue aberto apos mudar o departamento.

### 2. Arquivamento nao reflete no board
O `handleArchive` usa `updateConversation.mutateAsync(updatePayload)` que tem update otimista no `onMutate`. Porem, o `cancelQueries` no `onMutate` pode interferir com refetches subsequentes, e a sincronizacao via `useEffect` (que sincroniza `initialData` para `allConversations`) pode re-sobrescrever o estado otimista antes do novo fetch completar.

## Solucoes

### 1. Remover `onClose()` do department change
Remover a chamada `onClose()` da linha 2685, mantendo o painel aberto. O update otimista do `updateConversationDepartment` (que ja atualiza `setAllConversations` no `onMutate`) garante que o card se mova para a nova coluna automaticamente.

### 2. Tornar o arquivamento mais robusto
Em vez de depender apenas do update otimista generico do `updateConversation`, adicionar logica explicita no `handleArchive`:
- Apos o `mutateAsync`, forcar um `refetchQueries` (em vez de apenas `invalidateQueries`) para garantir que os dados frescos do servidor sejam buscados
- Adicionar um pequeno delay antes de `onClose()` para permitir que o React processe o re-render

## Arquivo a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/kanban/KanbanChatPanel.tsx` | (1) Remover `onClose()` do `handleDepartmentChange`; (2) No `handleArchive`, trocar `invalidateQueries` por `refetchQueries` e garantir que o painel so feche apos o refetch completar |

## Detalhes Tecnicos

### handleDepartmentChange (linha 2678-2688)
```text
const handleDepartmentChange = (deptId: string) => {
  const newDeptId = currentDepartment?.id === deptId ? null : deptId;
  updateConversationDepartment.mutate({ conversationId, departmentId: newDeptId, clientId }, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({ title: "Departamento atualizado" });
      setDepartmentOpen(false);
      // Removido: onClose() - manter painel aberto
    },
  });
};
```

### handleArchive (linhas 2510-2515)
```text
await updateConversation.mutateAsync(updatePayload);
// Forcar refetch para garantir dados atualizados
await queryClient.refetchQueries({ queryKey: ["conversations"] });
toast({ title: "Conversa arquivada" });
setArchiveDialogOpen(false);
onClose();
```

## Impacto

- **Risco**: Baixo - mudancas pontuais em callbacks
- **Resultado**: (1) Painel fica aberto ao trocar departamento, card move para nova coluna; (2) Arquivamento atualiza o board imediatamente
