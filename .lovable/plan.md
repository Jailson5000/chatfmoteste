

## Corrigir Dashboard + Cache Diario de Metricas

### Parte 1: Bugs atuais

#### Bug 1: Dados inconsistentes entre cards e grafico de volume
**Causa**: Os cards usam `count: "exact"` (contagem precisa), mas o grafico de volume busca mensagens com `limit(5000)` por chunk. Quando ha mais de 5000 mensagens num chunk, o grafico mostra menos.

**Solucao**: Refatorar o time series para usar `countMessagesInChunks` por dia (counts exatos), em vez de buscar todas as mensagens e agrupar no frontend.

#### Bug 2: Filtro de conexao ignorado em conversas ativas/arquivadas
**Causa**: As queries de `activeConversations` e `archivedConversations` aplicam filtros de atendente e departamento, mas NAO aplicam `connectionIds`.

**Solucao**: Adicionar `.in("whatsapp_instance_id", filters.connectionIds)` nas queries de activeQuery e archivedQuery.

---

### Parte 2: Cache diario de metricas (ideia do usuario)

Em vez de recalcular tudo do zero toda vez que o dashboard abre, salvar um "snapshot" diario a meia-noite. Assim, para dias passados, os dados ja estao prontos -- so precisa calcular o dia de hoje em tempo real.

#### Nova tabela: `dashboard_daily_snapshots`

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid | PK |
| law_firm_id | uuid | FK para law_firms |
| snapshot_date | date | Dia do snapshot (ex: 2026-02-20) |
| messages_received | integer | Mensagens recebidas naquele dia |
| messages_sent | integer | Mensagens enviadas naquele dia |
| conversations_active | integer | Conversas unicas com atividade |
| created_at | timestamptz | Quando foi gerado |

- Index unico em `(law_firm_id, snapshot_date)` para evitar duplicatas
- RLS habilitado: usuarios so veem snapshots do proprio tenant

#### Novo cron job (SQL puro, sem Edge Function)

Roda todo dia as 00:30 (horario do servidor), calcula as metricas do dia anterior para cada tenant e insere na tabela. Usa SQL puro com `pg_cron` -- sem necessidade de Edge Function porque nao chama APIs externas.

#### Frontend: uso hibrido

O hook `useDashboardMetrics` passa a:
1. Para dias passados: buscar da tabela `dashboard_daily_snapshots` (instantaneo)
2. Para o dia de hoje: calcular em tempo real como faz hoje (so 1 dia de dados)
3. Somar os resultados para exibir nos cards e no grafico

Isso reduz drasticamente a carga no banco: em vez de contar milhares de mensagens de 30 dias, conta so as de hoje e soma com os snapshots salvos.

---

### Alteracoes por arquivo

**1. Migracao SQL (nova tabela + cron job)**

| Item | Detalhe |
|---|---|
| Tabela `dashboard_daily_snapshots` | 6 colunas, index unico, RLS |
| Funcao `generate_daily_dashboard_snapshots()` | SQL puro que calcula metricas do dia anterior para todos os tenants ativos |
| Cron job | `0 0 * * *` (meia-noite) chamando a funcao SQL |

**2. `src/hooks/useDashboardMetrics.tsx`**

| Alteracao | Detalhe |
|---|---|
| Adicionar filtro connectionIds em activeQuery e archivedQuery | Corrige o bug do filtro de conexao |
| Refatorar time series | Usar counts por dia em vez de buscar mensagens com limit |
| Usar snapshots para dias passados | Buscar `dashboard_daily_snapshots` para dias < hoje, calcular em tempo real so para hoje |

**3. Nenhum outro arquivo e alterado**

Os componentes `MessageMetricsCards.tsx`, `MessageVolumeChart.tsx` e `Dashboard.tsx` continuam iguais -- a mudanca e toda na camada de dados.

### Impacto

- Correcoes pontuais no hook de metricas (sem risco para outras funcionalidades)
- Nova tabela isolada, sem alterar tabelas existentes
- Cron job em SQL puro (sem Edge Function adicional)
- Dashboard fica mais rapido e preciso conforme os snapshots vao sendo gerados
- Retrocompativel: se nao houver snapshot para um dia, calcula em tempo real como fallback

