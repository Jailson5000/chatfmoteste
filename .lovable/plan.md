
## Substituir Grafico Mock por Dados Reais no Global Admin Dashboard

### Problema
O grafico "Crescimento Mensal" no Global Admin Dashboard usa dados hardcoded (mock) com valores inventados de Jul-Dez. O banco tem dados reais desde Dez/2025.

### Solucao
Criar uma query que agrupa `companies.created_at` e `whatsapp_instances.created_at` por mes, calculando o total acumulado (cumulativo) de empresas e conexoes ao longo do tempo. O grafico passa a refletir a realidade.

---

### Alteracoes

**Arquivo: `src/hooks/useSystemMetrics.tsx`**

| Alteracao | Detalhe |
|---|---|
| Nova query `growthData` | Buscar `companies(id, created_at)` e `whatsapp_instances(id, created_at)`, agrupar por mes (formato "MMM/YY"), calcular contagem cumulativa para cada mes |
| Retornar no hook | Adicionar `growthData` ao retorno do hook |

**Arquivo: `src/pages/global-admin/GlobalAdminDashboard.tsx`**

| Alteracao | Detalhe |
|---|---|
| Remover `areaChartData` mock | Deletar as linhas 34-42 com os dados hardcoded |
| Usar `growthData` do hook | Passar `growthData` (do `useSystemMetrics`) para o `AreaChart` |
| Atualizar referencia no export PDF | Usar `growthData` em vez de `areaChartData` no `handleExportPDF` |

### Logica de agregacao (frontend)

1. Buscar todas as empresas (`id, created_at`) e todas as instancias (`id, created_at`)
2. Agrupar por mes (ex: "Dez/25", "Jan/26", "Fev/26")
3. Calcular contagem acumulada: para cada mes, o valor e o total de registros criados ate aquele mes (inclusive)
4. Resultado: `[{ name: "Dez/25", empresas: 3, conexoes: 1 }, { name: "Jan/26", empresas: 6, conexoes: 4 }, ...]`

### Sem risco
- Nenhuma tabela do banco e alterada
- Nenhuma edge function e alterada
- So muda a fonte de dados de um grafico, de mock para real
