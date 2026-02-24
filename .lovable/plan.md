

# Conversas Nao Atualizam Apos Mover ~10 (Paginacao + Realtime)

## Diagnostico

Analisei detalhadamente o fluxo de dados e identifiquei **2 problemas principais** que causam conversas "congeladas" apos varias movimentacoes:

### Problema 1: `cancelQueries` cascata mata refetches do Realtime

Toda mutacao (`updateConversationDepartment`, `updateClientStatus`, `updateConversation`) chama `queryClient.cancelQueries({ queryKey: ["conversations"] })` no `onMutate`. Isso cancela qualquer refetch em andamento — inclusive os disparados pelo Realtime.

```text
T=0.0s  Move conv 1 → cancelQueries + optimistic update (lock 3s)
T=0.3s  Realtime → inicia refetch
T=0.5s  Move conv 2 → cancelQueries CANCELA o refetch do T=0.3s
T=0.8s  Realtime → inicia refetch
T=1.0s  Move conv 3 → cancelQueries CANCELA o refetch do T=0.8s
...
T=3.0s  Lock da conv 1 EXPIRA (nenhum refetch completou para confirmar)
T=3.3s  Realtime → refetch finalmente completa... mas so traz 30 itens
```

Apos 10+ movimentacoes rapidas, **nenhum refetch completa com sucesso** durante a janela de protecao de 3 segundos. Quando um refetch finalmente completa, traz apenas 30 conversas (offset=0, limit=30). Conversas fora dos top 30 **nunca recebem dados frescos do servidor**.

### Problema 2: Refetch traz apenas 30 itens — conversas alem disso ficam "congeladas"

O query principal sempre busca `_offset: 0, _limit: 30`. O sync effect (linha 214-251) merge esses 30 com o estado local completo:
- Conversas **nos 30**: recebem dados frescos (apos lock expirar)
- Conversas **fora dos 30**: mantem dados locais eternamente

O valor otimista do `department_id` persiste corretamente, mas **qualquer outra mudanca** (feita por outro usuario, pelo servidor, ou por automacao) nunca chega. Isso causa divergencia crescente entre o estado local e o servidor.

Apos 10+ movimentacoes, a acumulacao de dados stale torna a interface visivelmente incorreta — nomes, status, badges, e posicoes nao refletem o estado real.

### Problema 3: Nao ha invalidacao pos-mutacao

As mutacoes `updateConversationDepartment` e `updateConversation` **nao invalidam queries no `onSettled`**. Dependem 100% do Realtime. Se o Realtime falhou silenciosamente ou o refetch foi cancelado, nada forca uma atualizacao.

## Correcoes

### Arquivo: `src/hooks/useConversations.tsx`

**Correcao 1: Remover `cancelQueries` agressivo dos `onMutate`**

O `cancelQueries` so e necessario para evitar que um refetch em andamento sobrescreva o update otimista. Mas o `mergeWithOptimisticProtection` ja cuida disso. Remover `cancelQueries` permite que refetches do Realtime completem normalmente.

Remover `await queryClient.cancelQueries(...)` de:
- `updateConversation.onMutate` (linha 356)
- `updateConversationDepartment.onMutate` (linha 707)
- `updateConversationStatus.onMutate` (linha 413)
- `updateClientStatus.onMutate` (linha 859)

**Correcao 2: Adicionar invalidacao no `onSettled` das mutacoes criticas**

Adicionar invalidacao com delay de 4 segundos (logo apos o lock otimista de 3s expirar) para garantir que dados frescos sejam buscados mesmo se o Realtime falhar:

```typescript
onSettled: (_data, _error, variables) => {
  clearOptimisticUpdateAfterDelay(variables.conversationId);
  // Garantir refetch apos lock expirar (fallback se Realtime falhou)
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ["conversations", lawFirm?.id] });
  }, OPTIMISTIC_LOCK_DURATION_MS + 500); // 3500ms
},
```

Aplicar em: `updateConversation`, `updateConversationDepartment`, `updateConversationStatus`, `updateClientStatus`.

**Correcao 3: Refetch inteligente para conversas fora do batch inicial**

No sync effect (linha 214-251), quando `initialData` chega com 30 itens mas o estado local tem 100+, as 70+ conversas restantes nunca sao atualizadas. Adicionar logica para detectar conversas "stale" e buscar dados frescos individualmente quando necessario.

Alternativa mais simples: quando o sync effect detecta que ha mais conversas no estado local do que no refetch, agendar um `loadMore` para atualizar as conversas restantes. Ou aumentar o batch do refetch para cobrir todas as conversas ja carregadas:

```typescript
// Na queryFn, usar o offset maximo ja carregado
const fetchLimit = Math.max(CONVERSATIONS_BATCH_SIZE, offsetRef.current);

const { data } = await supabase.rpc('get_conversations_with_metadata', { 
  _law_firm_id: lawFirm.id,
  _limit: fetchLimit,  // Buscar todas as ja carregadas
  _offset: 0,
  _include_archived: true
});
```

Isso garante que refetches do Realtime tragam TODAS as conversas ja carregadas, nao apenas as primeiras 30.

## Resultado Esperado

1. Movimentacoes rapidas (10, 20, 50+) refletem imediatamente via update otimista
2. Refetches do Realtime nao sao cancelados e completam normalmente
3. `mergeWithOptimisticProtection` protege campos otimistas durante o lock de 3s
4. Apos 3.5s, invalidacao forcada garante dados frescos mesmo sem Realtime
5. Refetch traz todas as conversas ja carregadas (nao so 30), eliminando dados "congelados"

## Arquivos Afetados

| Arquivo | Mudanca |
|---|---|
| `src/hooks/useConversations.tsx` | Remover cancelQueries, adicionar invalidacao em onSettled, refetch dinamico baseado em offsetRef |

