

## Melhorias no Dashboard

### Problema 1: Mensagens e conversas mostrando 0
A causa raiz e que o sistema busca ate 10.000 IDs de conversas e depois usa `.in("conversation_id", convIds)` para contar mensagens. Quando ha muitas conversas, essa lista de IDs ultrapassa o limite de URL do banco, causando falha silenciosa. A solucao e refatorar as queries para contar mensagens e conversas diretamente com filtros no banco, sem precisar passar listas enormes de IDs.

### Problema 2: Status cards mostrando apenas 6 status
O codigo atual usa `statuses.slice(0, 6)` nos cards e `statuses.slice(0, 5)` no grafico de evolucao. Precisa mostrar TODOS os status do cliente.

### Problema 3: Falta card de "Conversas Arquivadas"
O dashboard so mostra "Conversas Ativas". Precisa adicionar um quinto card mostrando conversas arquivadas.

---

### Alteracoes por arquivo

**1. `src/hooks/useDashboardMetrics.tsx`**

| Alteracao | Detalhe |
|---|---|
| Refatorar query de mensagens | Em vez de buscar 10.000 IDs de conversas e usar `.in()`, fazer as contagens (received, sent) direto com join pela `conversations` table usando `law_firm_id`, sem lista intermediaria de IDs |
| Adicionar `archivedConversations` | Nova query que conta conversas com `archived_at IS NOT NULL` |
| Atualizar interface `MessageMetrics` | Adicionar campo `archivedConversations: number` |

Abordagem tecnica para as queries:
- Manter as queries de count para `totalConversations` e `activeConversations` que ja usam `law_firm_id` diretamente (essas funcionam)
- Para mensagens recebidas/enviadas: usar uma abordagem em lotes (chunks de 500 IDs por vez) caso o array de `convIds` seja grande, somando os counts parciais
- Para conversas arquivadas: query simples `conversations.select(count).eq(law_firm_id).not.is(archived_at, null)`

**2. `src/components/dashboard/MessageMetricsCards.tsx`**

| Alteracao | Detalhe |
|---|---|
| Adicionar card "Conversas Arquivadas" | Novo card com icone `Archive`, cor cinza, mostrando `metrics.archivedConversations` |
| Grid ajustado | Mudar de `grid-cols-4` para `grid-cols-5` no desktop, mantendo `grid-cols-2` no mobile |

**3. `src/pages/Dashboard.tsx`**

| Alteracao | Detalhe |
|---|---|
| Remover `.slice(0, 6)` dos status cards | Mostrar TODOS os status do cliente, com grid responsivo |
| Remover `.slice(0, 5)` do grafico de evolucao | Mostrar TODOS os status na `AreaChart` e na legenda |
| Remover `.slice(0, 5)` do funil | Mostrar TODOS os status no funil |
| Remover `.slice(0, 5)` do donut de status | Mostrar TODOS os status |

### Impacto

- Baixa complexidade: sao ajustes em queries e remocao de limites hardcoded
- Nenhuma tabela do banco e alterada
- Nenhuma edge function e alterada
- O layout se adapta automaticamente ao numero de status do cliente
