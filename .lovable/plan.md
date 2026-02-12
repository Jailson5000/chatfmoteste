

# Correcao: Cards de Conversas nao atualizam Status em tempo real

## Problema Identificado

Na pagina de **Conversas** (`/conversations`), o card da sidebar le o status da conversa assim:

```text
clientStatus: conv.client?.custom_status || null
```

Ou seja, ele le o **objeto completo** `{id, name, color}` do campo `custom_status` (que vem do JOIN no banco). Porem, a atualizacao otimista no `useConversations.tsx` so atualiza `custom_status_id` (o ID), sem atualizar o objeto `custom_status`:

```text
client: { ...client, custom_status_id: statusId }
// custom_status continua com o valor ANTIGO!
```

**Resultado:** O card continua mostrando o badge do status antigo ate o proximo refetch.

**Segundo problema:** O componente `ContactStatusTags` (painel lateral direito na pagina de Conversas) usa `useClients().updateClientStatus` -- uma mutacao separada que nao atualiza `allConversations` e nao registra lock otimista. Para conversas alem da 31a, o status nunca atualiza no card da sidebar.

---

## Plano de Correcao

### Correcao 1: Incluir o objeto `custom_status` completo na atualizacao otimista

**Arquivo:** `src/hooks/useConversations.tsx`

No `onMutate` do `updateClientStatus`, alem de setar `custom_status_id`, tambem setar `custom_status` com o objeto `{id, name, color}` correto. Para isso, precisamos buscar o status na cache do React Query (`["custom_statuses", lawFirm?.id]`).

Mudanca no `onMutate` (linhas 837-878):

```text
onMutate: async ({ clientId, statusId }) => {
  await queryClient.cancelQueries({ queryKey: ["conversations"] });

  // Lookup status object from cache
  const cachedStatuses = queryClient.getQueryData<Array<{id: string; name: string; color: string}>>(
    ["custom_statuses", lawFirm?.id]
  );
  const statusObj = statusId 
    ? cachedStatuses?.find(s => s.id === statusId) || null 
    : null;

  // ... setQueryData e setAllConversations passam a incluir:
  client: { 
    ...client, 
    custom_status_id: statusId,
    custom_status: statusObj ? { id: statusObj.id, name: statusObj.name, color: statusObj.color } : null
  }
```

Isso garante que `conv.client?.custom_status` retorne o objeto correto imediatamente, tanto no `queryClient` cache quanto no `allConversations` local.

### Correcao 2: Fazer `ContactStatusTags` usar a mutacao compartilhada

**Arquivo:** `src/pages/Conversations.tsx`

O `handleChangeStatus` (linha 2637) ja usa `updateClientStatus` do `useConversations()`. Porem, o componente `ContactStatusTags` (renderizado no painel lateral direito) usa internamente `useClients().updateClientStatus` -- uma mutacao completamente separada.

**Solucao:** Passar `handleChangeStatus` como prop para `ContactStatusTags`, ou adicionar uma prop `onStatusChange` que sobrescreva o comportamento interno.

**Arquivo:** `src/components/conversations/ContactStatusTags.tsx`

Adicionar prop opcional `onStatusChange?: (statusId: string | null) => void`. Quando presente, usar essa funcao em vez de `useClients().updateClientStatus`. Isso permite que o componente funcione tanto standalone quanto integrado com o estado compartilhado.

### Correcao 3: Adicionar atualizacao otimista para tags no `updateConversationTags`

**Arquivo:** `src/hooks/useConversations.tsx`

O `updateConversationTags` (linha 773) nao tem `onMutate` -- nenhuma atualizacao otimista. Ele so faz `invalidateQueries(["conversations"])` no `onSuccess`, que nao funciona para conversas alem da 31a.

**Adicionar:**
- `onMutate`: Atualizar `conversations.tags` no `allConversations` e registrar lock
- `onSettled`: Limpar lock
- `onError`: Rollback

**Nota:** A sidebar de Conversas le tags de `conv.client_tags` (tabela `client_tags`), nao de `conv.tags`. Porem, o `handleChangeTags` chama `updateConversationTags` que atualiza `conversations.tags`. Isso indica uma inconsistencia: o componente `ContactStatusTags` manipula `client_tags` (tabela separada), enquanto `updateConversationTags` atualiza `conversations.tags`. Ambos os caminhos precisam atualizar `allConversations` localmente para refletir no card.

Para tags via `ContactStatusTags`, a mesma abordagem da Correcao 2 sera usada: passar uma callback `onTagsChange` que atualize o `allConversations` diretamente.

---

## Detalhes Tecnicos

### Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/hooks/useConversations.tsx` | Incluir `custom_status` objeto no `onMutate` de `updateClientStatus`; adicionar `onMutate` com update otimista ao `updateConversationTags` |
| `src/components/conversations/ContactStatusTags.tsx` | Adicionar prop `onStatusChange` e `onTagsChange` opcionais |
| `src/pages/Conversations.tsx` | Passar `handleChangeStatus` e callback de tags para `ContactStatusTags` |

### Fluxo Corrigido (Status na pagina Conversas)

1. Usuario clica "Analise" no painel lateral direito
2. `onStatusChange` (prop) chama `handleChangeStatus` -> `updateClientStatus.mutate()`
3. `onMutate` busca status `{id, name, color}` do cache de `custom_statuses`
4. `setAllConversations` atualiza `client.custom_status_id` E `client.custom_status`
5. `mappedConversations` recalcula -> `clientStatus` tem o objeto correto -> badge atualiza
6. Lock de 3s protege contra refetch stale

### Risco

- **Muito baixo**: Apenas adiciona dados que ja existem no cache ao update otimista
- **Sem breaking changes**: Props opcionais com fallback para comportamento atual
- **Retrocompativel**: `ContactStatusTags` continua funcionando standalone em outros contextos

