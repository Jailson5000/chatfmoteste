

## Correcoes do Dashboard - Metricas e Filtros de Data

### Problemas Identificados

**1. Filtro padrao "Todo periodo" causa dados inconsistentes**
Quando o dashboard abre, ele usa "Todo periodo" que busca 365 dias de dados. Isso sobrecarrega a consulta (limite de 5000 mensagens no time series) e mostra dados incompletos.

**2. Bug de fuso horario nos filtros de data**
O codigo calcula `subDays(now, 7)` sem normalizar para o inicio do dia. Por exemplo, se agora sao 17:00 do dia 21/02, o filtro de 7 dias comeca em 14/02 as 17:00 -- mas os buckets do grafico comecam em 14/02 as 00:00. Isso causa:
- O primeiro dia do periodo aparece com dados parciais (faltando mensagens da manha)
- O ultimo dia (hoje) pode nao mostrar dados porque o bucket termina as 23:59 mas a query pode nao capturar corretamente
- O mesmo problema existe para "30 dias"

**3. Primeiro quadro (cards de metricas) nao mostra dados sem selecionar departamento**
Com o filtro "Todo periodo", a query busca 365 dias e pode exceder o limite de 10.000 conversas ou os 5.000 mensagens, retornando dados truncados ou zerados. Ao trocar o padrao para "Este mes", a quantidade de dados fica gerenciavel e os cards funcionam corretamente sem precisar filtrar por departamento.

### Solucao

**Arquivo: `src/pages/Dashboard.tsx`**
- Trocar o valor inicial do estado `dateFilter` de `"all"` para `"month"`
- Remover a opcao "Todo periodo" do select de filtros (eliminar o `<SelectItem value="all">`)

**Arquivo: `src/hooks/useDashboardMetrics.tsx`**
- Corrigir a funcao `getDateRange()` para usar `startOfDay()` em todos os casos:
  - "7days": `startOfDay(subDays(now, 7))` em vez de `subDays(now, 7)`
  - "30days": `startOfDay(subDays(now, 30))` em vez de `subDays(now, 30)`
  - "all": `startOfDay(subDays(now, 365))` em vez de `subDays(now, 365)` (mantido como fallback de seguranca)

Essas tres mudancas cirurgicas resolvem todos os problemas reportados sem alterar nenhuma outra logica do dashboard.

### Detalhes tecnicos

```text
// ANTES (useDashboardMetrics.tsx, getDateRange):
case "7days":
  startDate = subDays(now, 7);        // 14/02 as 17:00 (hora atual)
case "30days":
  startDate = subDays(now, 30);       // 22/01 as 17:00
default:
  startDate = subDays(now, 365);      // 22/02/2025 as 17:00

// DEPOIS:
case "7days":
  startDate = startOfDay(subDays(now, 7));   // 14/02 as 00:00
case "30days":
  startDate = startOfDay(subDays(now, 30));  // 22/01 as 00:00
default:
  startDate = startOfDay(subDays(now, 365)); // 22/02/2025 as 00:00
```

```text
// ANTES (Dashboard.tsx, linha 70):
const [dateFilter, setDateFilter] = useState<DateFilter>("all");

// DEPOIS:
const [dateFilter, setDateFilter] = useState<DateFilter>("month");
```

```text
// ANTES (Dashboard.tsx, linha 449):
<SelectItem value="all">Todo período</SelectItem>

// REMOVIDO - essa opcao deixa de existir
```

### Impacto

| Mudanca | Efeito |
|---|---|
| Padrao "Este mes" | Cards mostram dados do mes atual imediatamente, sem precisar selecionar departamento |
| Remover "Todo periodo" | Evita queries pesadas que excedem limites e retornam dados truncados |
| `startOfDay()` nos filtros | Todos os dias do periodo aparecem completos no grafico (incluindo hoje e o primeiro dia) |

### Arquivos modificados

| Arquivo | Alteracao |
|---|---|
| `src/pages/Dashboard.tsx` | Trocar default para "month"; remover opcao "all" do select |
| `src/hooks/useDashboardMetrics.tsx` | Adicionar `startOfDay()` nos cases "7days", "30days" e default |

