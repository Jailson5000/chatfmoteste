

# Correcao Definitiva: Status e Tags para TODAS as Conversas (30, 200, 1500+)

## Problema Real

As correcoes anteriores passaram as mutacoes corretas via props, mas a mutacao `updateClientStatus` tem um **bug critico**: ela faz `setAllConversations` mas **NAO registra um lock otimista** (`registerOptimisticUpdate`). Quando o Realtime dispara ~300ms depois e o sync effect roda `mergeWithOptimisticProtection`, ele nao encontra nenhum lock e **sobrescreve** a mudanca com dados stale do banco.

Para tags, o `handleTagToggle` faz operacoes diretas no Supabase sem nunca atualizar o campo `conversation.tags` no `allConversations` local.

---

## Correcao 1: Adicionar lock otimista ao `updateClientStatus` (CRITICO)

**Arquivo:** `src/hooks/useConversations.tsx` (linhas 837-890)

O `onMutate` ja faz `setAllConversations` corretamente. Falta apenas:

1. Encontrar o `conversationId` correspondente ao `clientId` para registrar o lock
2. Chamar `registerOptimisticUpdate(conversationId, { client: ... })` para proteger contra refetch stale
3. No `onSettled`, chamar `clearOptimisticUpdateAfterDelay(conversationId)` para limpar o lock apos 3 segundos

Mudanca no `onMutate`:
```text
// Antes do return { previousConversations }:
// Find conversation by clientId to register lock
const targetConv = allConversations.find(c => {
  const client = c.client as { id?: string } | null;
  return client?.id === clientId;
});
if (targetConv) {
  registerOptimisticUpdate(targetConv.id, { client: { custom_status_id: statusId } });
}
```

Mudanca no `onSettled`:
```text
onSettled: (_data, _error, variables) => {
  // Find conversation to clear lock
  const targetConv = allConversations.find(c => {
    const client = c.client as { id?: string } | null;
    return client?.id === variables.clientId;
  });
  if (targetConv) {
    clearOptimisticUpdateAfterDelay(targetConv.id);
  }
  queryClient.invalidateQueries({ queryKey: ["clients"] });
  queryClient.invalidateQueries({ queryKey: ["scheduled-follow-ups"] });
  queryClient.invalidateQueries({ queryKey: ["all-scheduled-follow-ups"] });
},
```

## Correcao 2: Atualizar `allConversations` no `handleTagToggle` (CRITICO)

**Arquivo:** `src/components/kanban/KanbanChatPanel.tsx` (linhas 2622-2694)

O KanbanCard le tags de `conversation.tags` (array de strings). Quando uma tag e adicionada/removida, precisamos atualizar esse campo localmente via uma mutacao compartilhada.

Abordagem: Adicionar nova prop `setAllConversationsFn` que permite ao painel atualizar o estado compartilhado de conversas, OU usar a mutacao `updateConversationTags` do `useConversations` que ja existe (linha 773).

**Opcao escolhida (mais limpa):** Usar `updateConversationTags` do `useConversations` via prop.

Mas `updateConversationTags` atualiza `conversations.tags` (tabela conversations), enquanto `handleTagToggle` manipula `client_tags` (tabela separada). Sao coisas diferentes.

**Solucao real:** Apos a operacao no Supabase, atualizar `allConversations` localmente via `setAllConversations` passado como prop:

1. Adicionar prop `setAllConversationsFn` no `KanbanChatPanel`
2. Apos insert/delete na `client_tags`, chamar `setAllConversationsFn` para atualizar o `client_tags` da conversa correspondente
3. Registrar lock otimista via prop `registerOptimisticUpdateFn`

**Arquivo:** `src/pages/Kanban.tsx`
- Passar `setAllConversations` e `registerOptimisticUpdate` como props

**Arquivo:** `src/hooks/useConversations.tsx`
- Exportar `setAllConversations` e `registerOptimisticUpdate` no retorno do hook (ja retorna `setAllConversations` se necessario; verificar)

## Correcao 3: Remover `invalidateQueries(["conversations"])` com delay no handleTagToggle

**Arquivo:** `src/components/kanban/KanbanChatPanel.tsx` (linhas 2686-2690)

Com a correcao 2 implementada, a invalidacao manual com setTimeout nao e mais necessaria e causa o mesmo problema de race condition para conversas antigas. Remover.

---

## Detalhes Tecnicos

### Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/hooks/useConversations.tsx` | Adicionar `registerOptimisticUpdate` + `clearOptimisticUpdateAfterDelay` no `updateClientStatus`; exportar `setAllConversations`, `registerOptimisticUpdate`, `clearOptimisticUpdateAfterDelay` |
| `src/components/kanban/KanbanChatPanel.tsx` | Adicionar props para `setAllConversationsFn`, `registerOptimisticUpdateFn`, `clearOptimisticUpdateAfterDelayFn`; atualizar `handleTagToggle` para update otimista local; remover setTimeout invalidation |
| `src/pages/Kanban.tsx` | Passar as novas props do hook para o painel |

### Por que isso funciona para 32, 200, 1500 conversas

O `allConversations` acumula TODAS as conversas carregadas (incluindo paginadas). O `setAllConversations` atualiza diretamente esse array completo, independente de quantas conversas existem. O `registerOptimisticUpdate` protege o campo atualizado por 3 segundos contra refetches parciais (que so trazem as primeiras 30). Isso garante que mesmo a conversa #1500 mantenha seu status/tag correto apos o update.

### Fluxo Corrigido (Status)

1. Usuario clica "Qualificado" no painel
2. `onMutate` -> `setAllConversations` atualiza o `client.custom_status_id` -> card move instantaneamente
3. `registerOptimisticUpdate(convId, { client })` -> lock de 3s ativo
4. Realtime dispara apos ~300ms -> refetch traz 30 primeiras conversas
5. Sync effect roda `mergeWithOptimisticProtection` -> encontra lock ativo -> preserva status otimista
6. Lock expira apos 3s -> proximo refetch atualiza com dados confirmados do banco

### Fluxo Corrigido (Tags)

1. Usuario clica tag no painel
2. Supabase insert/delete em `client_tags` executa
3. `setAllConversationsFn` atualiza `client_tags` da conversa localmente -> tag aparece/desaparece no card
4. `registerOptimisticUpdateFn` protege por 3s
5. Realtime confirma -> merge protegido mantem a tag correta

## Risco
- **Baixo**: Adiciona logica de lock que ja existe em todas as outras mutacoes
- **Sem breaking changes**: Props opcionais com fallback
- **Padrao consistente**: Todas as mutacoes agora seguem o mesmo pattern de lock otimista

