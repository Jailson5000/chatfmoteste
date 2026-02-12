

# Correcao: Painel de Conversa nao Atualiza o Kanban Board em Tempo Real

## Causa Raiz

O `KanbanChatPanel` chama `useConversations()` na linha 1083, criando uma **segunda instancia** do hook, separada da instancia do `Kanban.tsx` (linha 38). Cada instancia tem seu proprio `allConversations` (useState) e `pendingOptimisticUpdates` (useRef).

Quando o usuario muda departamento ou arquiva pelo painel lateral:

1. `onMutate` chama `setAllConversations` -- mas atualiza o estado da **instancia do painel**, nao do board
2. `registerOptimisticUpdate` registra o lock no **ref do painel**, nao no ref do board
3. O board so atualiza quando o Realtime dispara, mas como o lock otimista esta no ref errado, o board nao tem protecao contra dados stale
4. Conversas antigas (alem das 30 primeiras) nao estao no query cache, entao `setQueryData` tambem nao as afeta

**Por que arrastar funciona:** O drag-and-drop e tratado diretamente no `Kanban.tsx`, que usa sua propria instancia de `useConversations()` -- entao `setAllConversations` e `registerOptimisticUpdate` atuam no estado correto.

## Solucao

Passar as mutacoes (`updateConversation`, `updateConversationDepartment`, `transferHandler`) da instancia do `Kanban.tsx` para o `KanbanChatPanel` via props. Assim, ambos operam sobre o mesmo estado compartilhado.

## Implementacao

### Passo 1: Adicionar props de mutacoes ao `KanbanChatPanel`

**Arquivo:** `src/components/kanban/KanbanChatPanel.tsx`

Adicionar 3 props opcionais na interface `KanbanChatPanelProps`:

```text
updateConversationMutation?: typeof updateConversation
updateConversationDepartmentMutation?: typeof updateConversationDepartment
transferHandlerMutation?: typeof transferHandler
```

No corpo do componente (linha 1083), usar as props quando disponíveis, senão manter o fallback para a instancia local:

```text
const localHook = useConversations();
const effectiveUpdateConversation = updateConversationMutation ?? localHook.updateConversation;
const effectiveUpdateDepartment = updateConversationDepartmentMutation ?? localHook.updateConversationDepartment;
const effectiveTransferHandler = transferHandlerMutation ?? localHook.transferHandler;
```

Atualizar todos os usos de `updateConversation`, `updateConversationDepartment` e `transferHandler` no componente para usar as versoes `effective*`.

### Passo 2: Passar as mutacoes do `Kanban.tsx` para o `KanbanChatPanel`

**Arquivo:** `src/pages/Kanban.tsx`

Na renderizacao do `KanbanChatPanel` (linha 630), adicionar as 3 props:

```text
<KanbanChatPanel
  ...
  updateConversationMutation={updateConversation}
  updateConversationDepartmentMutation={updateConversationDepartment}
  transferHandlerMutation={transferHandler}
/>
```

### Passo 3: Remover `invalidateQueries(["conversations"])` residual

**Arquivo:** `src/components/kanban/KanbanChatPanel.tsx`

- **Linha 2672:** Remover `queryClient.invalidateQueries({ queryKey: ["conversations"] })` no handler de tags. Isso causa race condition que reverte o update otimista para conversas antigas.

## Fluxo Corrigido

1. Usuario clica em "Recepcao" no painel lateral da conversa
2. `handleDepartmentChange` chama `updateConversationDepartment.mutate()` -- agora e a mutacao do **Kanban.tsx**
3. O `onMutate` executa `setAllConversations` no estado do **board** -- card se move instantaneamente
4. `registerOptimisticUpdate` registra o lock no ref do **board** -- protege contra dados stale
5. Realtime confirma apos ~300ms -- merge respeita o lock ativo

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/components/kanban/KanbanChatPanel.tsx` | Adicionar 3 props de mutacao, usar versoes efetivas, remover invalidateQueries residual |
| `src/pages/Kanban.tsx` | Passar as 3 mutacoes como props |

## Risco
- **Muito baixo**: As props sao opcionais com fallback para comportamento atual
- **Sem breaking changes**: Nenhum outro componente que usa KanbanChatPanel precisa mudar
- **Retrocompativel**: Se chamado sem as props, funciona exatamente como antes

