

# Correcao: Conversas Antigas Nao Atualizam em Tempo Real no Kanban

## Causa Raiz Identificada

O problema afeta especificamente conversas antigas porque elas estao **alem das primeiras 30 conversas** carregadas pelo sistema de paginacao. A cada evento Realtime ou invalidacao manual, o sistema **recarrega tudo do zero**, causando uma cascata de problemas.

### Fluxo do Bug (Conversas Antigas)

1. Usuario muda departamento ou arquiva uma conversa antiga
2. Update otimista funciona -- o card se move imediatamente
3. Realtime dispara invalidacao apos ~300ms
4. A query principal re-executa e retorna apenas as **30 conversas mais recentes**
5. O `queryFn` **reseta `offsetRef = 0`**, fazendo `hasMore = true`
6. O Kanban detecta `hasMore = true` e comeca a recarregar TODAS as paginas novamente
7. Durante esse recarregamento de multiplas paginas, ocorrem varios re-renders
8. Se o lock otimista de 3 segundos expirar antes de toda a re-paginacao completar, o dado otimista pode ser sobrescrito
9. Alem disso, o `refetchQueries` no `handleArchive` (linha 2511) **espera o resultado** antes de continuar, criando uma race condition adicional

### Por que conversas NOVAS funcionam

Conversas recentes estao dentro das primeiras 30 retornadas pela query. O merge com protecao otimista funciona perfeitamente para elas porque o dado fresh ja vem no primeiro lote, dentro do tempo do lock de 3 segundos.

---

## Correcoes Necessarias

### Correcao 1: Remover `refetchQueries` do `handleArchive` (CRITICO)
**Arquivo:** `src/components/kanban/KanbanChatPanel.tsx`
- **Linha 2511:** Remover `await queryClient.refetchQueries({ queryKey: ["conversations"] });`
- O `updateConversation.mutateAsync` ja executa o `onMutate` que atualiza o estado local via `setAllConversations`
- O Realtime cuida da confirmacao automaticamente

### Correcao 2: Remover `invalidateQueries` do `updateConversationStatus.onSuccess` (CRITICO)
**Arquivo:** `src/hooks/useConversations.tsx`
- **Linha 409:** Remover `queryClient.invalidateQueries({ queryKey: ["conversations"] });`
- O `onMutate` ja atualiza o estado local, e o `onSettled` ja limpa o lock otimista
- O Realtime via RealtimeSyncContext ja faz o refetch automaticamente
- Manter apenas o toast de sucesso

### Correcao 3: Evitar reset de paginacao em refetches Realtime (CRITICO)
**Arquivo:** `src/hooks/useConversations.tsx`
- **Linhas 146, 164-165:** Modificar o `queryFn` para NAO resetar `offsetRef.current` quando ja existem conversas carregadas
- Atualmente, toda vez que o `queryFn` roda, ele faz `offsetRef.current = 0`, o que forca o Kanban a recarregar todas as paginas do zero
- Correcao: Manter o offset atual quando for um refetch (nao um fetch inicial)

Logica proposta:
- Se `lawFirmIdRef.current === lawFirm.id` (mesmo tenant, e um refetch), manter o `offsetRef.current` intacto
- Apenas resetar quando for uma mudanca de tenant ou primeiro carregamento

### Correcao 4: Aplicar protecao otimista no `loadMoreConversations` (MEDIO)
**Arquivo:** `src/hooks/useConversations.tsx`
- **Linhas 269-275:** O `loadMoreConversations` atualmente apenas deduplica por ID, mas nao aplica `mergeWithOptimisticProtection`
- Se uma conversa antiga ja existe no estado local com um update otimista, e o `loadMore` traz a mesma conversa do banco (possivelmente com dado stale), a deduplicacao impede que ela seja adicionada novamente -- isso esta correto
- Porem, quando o offset e resetado (correcao 3 resolve isso), o `loadMore` pode trazer conversas que ja existem localmente. A deduplicacao atual funciona, mas por seguranca, adicionar merge com protecao otimista para conversas que ja existem

### Correcao 5: Remover `invalidateQueries(["conversations"])` do `updateClientStatus.onSettled` (MENOR)
**Arquivo:** `src/hooks/useConversations.tsx`
- Remover apenas a invalidacao de `["conversations"]`, manter `["clients"]`, `["scheduled-follow-ups"]` e `["all-scheduled-follow-ups"]`
- A invalidacao de conversations e redundante pois o Realtime ja cuida disso

---

## Arquivos Modificados

| Arquivo | Correcao |
|---------|----------|
| `src/components/kanban/KanbanChatPanel.tsx` | Remover `refetchQueries` do `handleArchive` |
| `src/hooks/useConversations.tsx` | Remover `invalidateQueries` redundantes, evitar reset de paginacao, protecao otimista no `loadMore` |

## Risco
- **Baixo**: Todas as correcoes removem codigo redundante que causa race conditions
- **Nenhuma logica de negocio alterada**: Apenas otimizacao de sincronizacao de cache
- **Realtime mantem a consistencia**: O RealtimeSyncContext garante que os dados sejam atualizados automaticamente

