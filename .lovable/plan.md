

## Correcao e Melhoria do Dashboard - Analise Completa

### Problemas Identificados

**1. Limite de 1000 linhas nas mensagens (BUG CRITICO)**
Nas queries do `useDashboardMetrics.tsx`, as mensagens sao buscadas sem `.limit()` explicito, o que aplica o limite padrao de 1000 linhas do banco. Para tenants com mais de 1000 mensagens no periodo, os cards "Mensagens Recebidas" e "Mensagens Enviadas" e o grafico de volume ficam truncados e incorretos.

Afeta:
- Linha 129: query de mensagens para `messageMetrics` (cards)
- Linha 274: query de mensagens para `attendantMetrics`
- Linha 363: query de mensagens para `timeSeriesData` (grafico)
- Linha 107: query de conversation IDs (tambem limitada a 1000)

**2. Grafico de Volume sem linha de Conversas**
O hook ja calcula `conversations` por dia (linha 382), mas o componente `MessageVolumeChart.tsx` so renderiza "Recebidas" e "Enviadas". A linha de conversas nao aparece no grafico.

**3. Graficos "Etiquetas" e "Status" sao identicos (linhas 644-735)**
Os dois graficos de pizza na secao inferior usam exatamente os mesmos dados (`clientsByStatus`) - um se chama "Etiquetas" e o outro "Status", mas mostram a mesma coisa. O grafico de "Etiquetas" deveria usar dados de tags reais dos clientes.

**4. Legenda duplicada no grafico de Volume**
O `MessageVolumeChart.tsx` tem uma `<Legend>` do Recharts E uma legenda manual em HTML abaixo. Isso gera redundancia visual.

---

### Plano de Correcao

#### Arquivo 1: `src/hooks/useDashboardMetrics.tsx`

**Correcao do limite de 1000 linhas:**

- **Cards de mensagens (messageMetrics)**: Substituir a query que busca todas as mensagens por duas queries de contagem separadas com `count: "exact", head: true`:
  - Uma para `is_from_me = false` (recebidas)
  - Uma para `is_from_me = true` (enviadas)
  - Isso elimina o limite de 1000 pois nao busca linhas, so conta

- **Query de conversation IDs**: Adicionar `.limit(10000)` para cobrir tenants maiores. Se o tenant tiver mais de 10.000 conversas, usar paginacao.

- **Time series (grafico)**: Adicionar `.limit(5000)` na query de mensagens para o grafico. Isso cobre a maioria dos cenarios (5000 mensagens em 60 dias).

- **Attendant metrics**: Adicionar `.limit(5000)` na query de mensagens.

- **Manter calculo de avgResponseTime**: Continuar usando a abordagem atual de buscar mensagens para calcular tempo de resposta, mas apenas na query de time series que ja busca as mensagens.

#### Arquivo 2: `src/components/dashboard/MessageVolumeChart.tsx`

**Adicionar linha de Conversas no grafico:**

- Adicionar gradiente roxo `colorConversations` (#8b5cf6) nas `<defs>`
- Adicionar terceiro `<Area>` com `dataKey="conversations"`
- Remover a `<Legend>` duplicada do Recharts (manter apenas a legenda HTML manual)
- Adicionar item "Conversas" (roxo) na legenda manual
- Atualizar o Tooltip para traduzir os nomes das series

#### Arquivo 3: `src/pages/Dashboard.tsx`

**Corrigir grafico "Etiquetas" duplicado:**

- O grafico "Etiquetas" (linhas 644-688) deve mostrar dados reais de tags dos clientes usando o hook `useTags` (ja importado em outros componentes)
- Criar um `useMemo` que agrupa `filteredClients` por suas tags reais (da tabela `client_tags`)
- Caso nao haja dados de tags disponiveis no hook `useClients`, buscar diretamente via query

---

### Analise de Risco

| Alteracao | Risco | Justificativa |
|-----------|-------|---------------|
| Contagem com `count: "exact"` | **Baixo** | Operacao padrao do banco, nao altera dados |
| Adicionar Area no grafico | **Muito Baixo** | Apenas adiciona elemento visual, dados ja existem |
| Remover Legend duplicada | **Muito Baixo** | Correcao visual apenas |
| Corrigir grafico Etiquetas | **Baixo** | Usa dados ja disponiveis no sistema, nao modifica estrutura |
| Aumentar `.limit()` | **Baixo** | Pode aumentar levemente o tempo de resposta para tenants grandes, mas resolve dados incorretos |

Nenhuma alteracao modifica o banco de dados, tabelas, RLS ou edge functions. Todas as mudancas sao exclusivamente no frontend (hooks e componentes React).

### Resumo das Alteracoes

| Arquivo | O que muda |
|---------|------------|
| `src/hooks/useDashboardMetrics.tsx` | Usar `count: "exact"` para totais de mensagens; adicionar `.limit()` explicito nas queries de mensagens |
| `src/components/dashboard/MessageVolumeChart.tsx` | Adicionar linha roxa de Conversas; remover Legend duplicada; traduzir tooltip |
| `src/pages/Dashboard.tsx` | Corrigir grafico "Etiquetas" para usar dados reais de tags em vez de duplicar o grafico de Status |

