

# Correcao: Sidebar e Kanban nao atualizam ao trocar handler (IA/Humano)

## Problema

Ao transferir uma conversa entre agentes de IA ou para um humano (via botao "Transferir" na tela de conversas ou no painel lateral do Kanban), a interface nao reflete a mudanca imediatamente. O usuario precisa dar F5 para ver o novo handler.

## Causa Raiz

A mutacao `transferHandler` em `useConversations.tsx` **nao tem update otimista** (`onMutate`). Ela depende apenas de `invalidateQueries` + `refetchQueries` no `onSuccess`. O refetch e assincrono e pode levar centenas de milissegundos - durante esse tempo a UI mostra dados antigos.

Alem disso, no `KanbanChatPanel`, os valores de `currentHandler`, `currentAutomationId` e `assignedProfile` sao passados como **props** pelo `Kanban.tsx`. Mesmo que o refetch atualize o cache, o componente pode nao re-renderizar se o pai nao repassar as props atualizadas sincronamente.

## Solucao

### 1. Adicionar Update Otimista ao `transferHandler` (useConversations.tsx)

Adicionar `onMutate` na mutacao `transferHandler` para atualizar o cache local imediatamente, da mesma forma que `updateConversation` ja faz:

```text
onMutate: async (variables) => {
  await queryClient.cancelQueries({ queryKey: ["conversations"] });
  const previousConversations = queryClient.getQueryData(["conversations"]);
  
  queryClient.setQueryData(["conversations"], (old) => 
    old?.map(conv => 
      conv.id === variables.conversationId 
        ? { 
            ...conv, 
            current_handler: variables.handlerType,
            assigned_to: variables.assignedTo || null,
            current_automation_id: variables.handlerType === 'ai' ? variables.automationId : null,
          }
        : conv
    )
  );
  
  return { previousConversations };
},
onError: (err, variables, context) => {
  queryClient.setQueryData(["conversations"], context?.previousConversations);
},
```

Isso garante que o cache atualiza **instantaneamente** antes do request ao servidor, fazendo a sidebar e o Kanban reagirem imediatamente.

### 2. Adicionar invalidacao explicita no KanbanChatPanel (handleTransferTo)

No `onSuccess` do `handleTransferTo`, adicionar invalidacao explicita como reforco:

```text
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["conversations"] });
  toast({ ... });
  setTransferOpen(false);
},
```

### 3. Adicionar invalidacao explicita no Conversations.tsx (handleTransferHandler)

Converter de `mutate` para `mutateAsync` ou adicionar callback `onSuccess` para forcar invalidacao:

```text
transferHandler.mutate({...}, {
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }
});
```

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/hooks/useConversations.tsx` | Adicionar `onMutate` com update otimista e `onError` com rollback na mutacao `transferHandler` |
| `src/components/kanban/KanbanChatPanel.tsx` | Adicionar `queryClient.invalidateQueries` no `onSuccess` do `handleTransferTo` |
| `src/pages/Conversations.tsx` | Adicionar callback `onSuccess` com invalidacao no `handleTransferHandler` |

## Impacto

- **Risco**: Baixo - segue o mesmo padrao de update otimista ja usado em `updateConversation` no mesmo arquivo
- **Resultado**: Ao transferir handler, sidebar e Kanban atualizam instantaneamente sem F5
