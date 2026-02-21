

## Alterar filtro padrao do Dashboard de "Este mes" para "Ultimos 7 dias"

### Problema
O Dashboard demora para carregar porque o filtro padrao e "Este mes", que pode incluir ate 28-31 dias de dados. Trocar para "Ultimos 7 dias" reduz a janela de dados e acelera o carregamento.

### Alteracao

**Arquivo: `src/pages/Dashboard.tsx` (linha 70)**

Trocar o valor inicial do `useState` de `"month"` para `"7days"`.

Antes:
```
const [dateFilter, setDateFilter] = useState<DateFilter>("month");
```

Depois:
```
const [dateFilter, setDateFilter] = useState<DateFilter>("7days");
```

Uma unica linha. Nenhum outro arquivo e alterado.

