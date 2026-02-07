
# Plano: Corrigir Cards Travando no Kanban Após Múltiplos Drags

## Problema Identificado

### Sintoma
- Ao mover mais de 5 cards rapidamente, eles "travam" visualmente
- Após F5 (refresh), as mudanças aparecem corretamente
- Significa que a persistência funciona, mas o estado local não reflete as mudanças

### Causa Raiz
O hook `useConversations` tem **duas fontes de dados desconectadas**:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                   FLUXO ATUAL (PROBLEMÁTICO)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   [Kanban] ← usa conversations ← usa allConversations (useState)            │
│                                                   ↑                         │
│                                                   │ NÃO É ATUALIZADO!       │
│                                                   │                         │
│   [Mutation onMutate] → queryClient.setQueryData ─┘                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

1. O **Kanban consome** `conversations`, que vem de `allConversations` (useState local, linha 247)
2. Os **optimistic updates** modificam o `queryClient.setQueryData` (linhas 592-598, 689-700)
3. O estado local `allConversations` **não é atualizado imediatamente**
4. A sincronização só acontece quando `initialData` muda (após refetch), mas com múltiplas mutações rápidas, o refetch fica atrasado ou enfileirado

### Por Que Funciona com Poucos Cards
- Com 1-4 cards, o `onSettled` → `invalidateQueries` completa antes da próxima operação
- Com 5+ cards em sequência rápida, as invalidações se acumulam e o estado local fica desatualizado

## Solução

Modificar as funções de mutation para atualizar **também** o state local `allConversations` no `onMutate` (optimistic update).

### Alteração 1: `updateConversationDepartment.onMutate`

Adicionar atualização do state local junto com o queryClient:

```typescript
onMutate: async ({ conversationId, departmentId }) => {
  await queryClient.cancelQueries({ queryKey: ["conversations"] });

  const previousConversations = queryClient.getQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id]);

  // Atualizar queryClient (para outros componentes)
  queryClient.setQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id], (old) => {
    if (!old) return old;
    return old.map((conv) =>
      conv.id === conversationId
        ? { ...conv, department_id: departmentId }
        : conv
    );
  });

  // NOVO: Atualizar state local para UI imediata
  setAllConversations(prev => 
    prev.map(conv => 
      conv.id === conversationId 
        ? { ...conv, department_id: departmentId } 
        : conv
    )
  );

  return { previousConversations };
},
```

### Alteração 2: `updateConversationDepartment.onError`

Rollback também no state local:

```typescript
onError: (error, { conversationId }, context) => {
  // Rollback queryClient
  if (context?.previousConversations) {
    queryClient.setQueryData(["conversations", lawFirm?.id], context.previousConversations);
  }
  
  // NOVO: Rollback state local
  if (context?.previousConversations) {
    setAllConversations(context.previousConversations);
  }
  
  toast({...});
},
```

### Alteração 3: `updateClientStatus.onMutate` (para status drag)

Mesma correção para atualização de status:

```typescript
onMutate: async ({ clientId, statusId }) => {
  await queryClient.cancelQueries({ queryKey: ["conversations"] });

  const previousConversations = queryClient.getQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id]);

  queryClient.setQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id], (old) => {
    if (!old) return old;
    return old.map((conv) => {
      const client = conv.client;
      if (client?.id === clientId) {
        return { ...conv, client: { ...client, custom_status_id: statusId } };
      }
      return conv;
    });
  });

  // NOVO: Atualizar state local
  setAllConversations(prev => 
    prev.map(conv => {
      const client = conv.client;
      if (client?.id === clientId) {
        return { ...conv, client: { ...client, custom_status_id: statusId } };
      }
      return conv;
    })
  );

  return { previousConversations };
},
```

### Alteração 4: `updateClientStatus.onError`

Rollback state local:

```typescript
onError: (error, _vars, context) => {
  if (context?.previousConversations) {
    queryClient.setQueryData(["conversations", lawFirm?.id], context.previousConversations);
    // NOVO: Rollback state local
    setAllConversations(context.previousConversations);
  }
  toast({...});
},
```

## Resumo das Alterações

| Arquivo | Local | Alteração |
|---------|-------|-----------|
| `useConversations.tsx` | `updateConversationDepartment.onMutate` (~linha 584) | Adicionar `setAllConversations` optimistic |
| `useConversations.tsx` | `updateConversationDepartment.onError` (~linha 603) | Adicionar rollback do state local |
| `useConversations.tsx` | `updateClientStatus.onMutate` (~linha 684) | Adicionar `setAllConversations` optimistic |
| `useConversations.tsx` | `updateClientStatus.onError` (~linha 705) | Adicionar rollback do state local |

## Fluxo Corrigido

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                   FLUXO CORRIGIDO                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   [Kanban] ← usa conversations ← usa allConversations (useState)            │
│                                                   ↑                         │
│                                                   │ ✅ ATUALIZADO!          │
│                                                   │                         │
│   [Mutation onMutate] → setAllConversations() ────┘                         │
│                       → queryClient.setQueryData (para outros hooks)        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Resultado Esperado

| Operação | Antes | Depois |
|----------|-------|--------|
| Mover 1 card | ✅ Funciona | ✅ Funciona |
| Mover 5 cards rápido | ❌ Trava | ✅ Funciona |
| Mover 10+ cards rápido | ❌ Trava completamente | ✅ Funciona |
| Erro de rede | Sem rollback visual | ✅ Rollback visual imediato |

## Risco de Quebra

**Muito Baixo**
- Apenas adiciona sincronização do state local
- Mantém toda lógica existente de queryClient
- Rollback funciona em ambos os lugares
- Não altera schema, RPC ou banco de dados
