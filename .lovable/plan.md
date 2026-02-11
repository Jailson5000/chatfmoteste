

# Corrigir Race Condition: Departamento não atualiza no Kanban

## Causa Raiz Identificada

O sistema tem **múltiplos pontos de falha** que causam o revert da atualização visual:

### Problema 1: QueryKey Mismatch (Crítico)
```
- useQuery queryKey: ["conversations", lawFirm?.id]   ✓ Com ID da firma
- invalidateQueries: ["conversations"]                  ✗ SEM ID da firma
```
**Impacto**: Quando `onSuccess` invalida com queryKey incorreta, o refetch não aciona corretamente. O cache fica inconsistente entre o hook e o componente.

### Problema 2: Invalidações Duplicadas
- `useConversations.tsx` linha 730-731: `invalidateQueries(["conversations"])`
- `useConversations.tsx` linha 731: `invalidateQueries(["chat-activity-actions"])`
- `KanbanChatPanel.tsx` linha 2682: **OUTRA** `invalidateQueries(["conversations"])` no `onSuccess` do `handleDepartmentChange`

**Impacto**: Quando mesmo a queryKey estiver correta, refetches duplicados causam race conditions. A segunda invalidação revert a primeira atualização otimista.

### Problema 3: QueryClient setQueryData sem incluir lawFirm?.id
Na linha 694, o `setQueryData` usa `["conversations", lawFirm?.id]`, mas o refetch em linha 730-731 invalida sem lawFirmId, então a sincronização falha para conversas antigas.

## Solução em 3 Passos

### Step 1: Corrigir QueryKey em useConversations.tsx
**Arquivo: `src/hooks/useConversations.tsx`**

Na função `updateConversationDepartment`, linhas 727-732:
```typescript
// ANTES:
onSuccess: () => {
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["chat-activity-actions"] });
  }, 1000);
}

// DEPOIS:
onSuccess: () => {
  // Removido - deixar o sync effect (useEffect) fazer refetch via Realtime
  // Não invalidar aqui para evitar race condition
}
```

Removemos a invalidação manual porque o `useEffect` (linhas 208-245) já sincroniza via `mergeWithOptimisticProtection`.

### Step 2: Remover Invalidação Duplicada em KanbanChatPanel.tsx
**Arquivo: `src/components/kanban/KanbanChatPanel.tsx`**

Na função `handleDepartmentChange`, linhas 2678-2687:
```typescript
// ANTES:
const handleDepartmentChange = (deptId: string) => {
  const newDeptId = currentDepartment?.id === deptId ? null : deptId;
  updateConversationDepartment.mutate({ conversationId, departmentId: newDeptId, clientId }, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });  // ❌ REMOVE ISTO
      toast({ title: "Departamento atualizado" });
      setDepartmentOpen(false);
    },
  });
};

// DEPOIS:
const handleDepartmentChange = (deptId: string) => {
  const newDeptId = currentDepartment?.id === deptId ? null : deptId;
  updateConversationDepartment.mutate({ conversationId, departmentId: newDeptId, clientId }, {
    onSuccess: () => {
      // Sem invalidateQueries aqui - deixar o hook gerenciar
      toast({ title: "Departamento atualizado" });
      setDepartmentOpen(false);
    },
  });
};
```

### Step 3: Também remover em `transferHandler` e `updateConversation`

Verificar se há `invalidateQueries` duplicadas em outros mutations que já têm proteção otimista.

## Como Funciona Depois da Correção

1. **Usuario arrasta ou muda departamento**
2. **onMutate**: 
   - Atualiza `pendingOptimisticUpdates` ref com a mudança
   - Atualiza `allConversations` no local state
   - Atualiza queryClient cache
3. **mutationFn**: Executa a query no banco
4. **onSuccess**: Nenhuma ação (antes causava race condition)
5. **Realtime** (300ms depois): Dispara `invalidateQueries(["conversations", lawFirmId])`
6. **Refetch**: Busca conversas com os dados atualizados
7. **useEffect sync**: Aplica `mergeWithOptimisticProtection`:
   - Se conversa tem lock ativo (< 3s): preserva campos otimistas
   - Se lock expirou: usa dados frescos do banco
   
**Resultado**: A conversa se move para o novo departamento **imediatamente** (otimista) e a Realtime confirma sem revert.

## Impacto

- **Alto Load (50+ conversas)**: UI atualiza instantaneamente, sem esperar refetch
- **Antigas Conversas**: `mergeWithOptimisticProtection` garante sync correto mesmo que estejam fora da view inicial
- **Sem F5**: Mudança persiste e sincroniza corretamente

## Risco

- **Muito Baixo**: Removemos código que CAUSAVA o bug, não mudamos lógica de negócio
- **Rollback fácil**: Se algo quebrar, revert a remoção das invalidações

