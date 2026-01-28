

# Melhorias no Dashboard de Empresas - Global Admin

## Problemas Identificados

### 1. Visualização Bloqueada quando Empresa Expandida
Quando uma empresa está expandida, o painel de detalhes ocupa espaço dentro da tabela, dificultando a visualização das outras empresas.

### 2. Parte Inferior Cortada
O ScrollArea tem `max-h-[calc(100vh-300px)]` que pode cortar conteúdo dependendo da altura da tela.

### 3. Falta Filtro de Empresas em Trial
Não há opção para filtrar empresas em período de teste (trial). Dados do banco mostram que existe "Miau test" em trial manual (expira 04/02/2026).

---

## Solução Proposta

### Mudança 1: Painel de Detalhes Deslizante (Sheet)
Substituir a linha expandida por um **Sheet lateral** que abre sobre o conteúdo, sem ocupar espaço na tabela.

```text
Antes:                              Depois:
┌───────────────────────┐           ┌──────────────────┬────────────┐
│ Empresa A             │           │ Empresa A        │            │
├───────────────────────┤           │ Empresa B ←      │  PAINEL    │
│ [Detalhes expandidos] │           │ Empresa C        │  LATERAL   │
│ ...muito espaço...    │           │ Empresa D        │  (Sheet)   │
├───────────────────────┤           │ ...              │            │
│ Empresa B             │           │                  │            │
│ Empresa C             │           └──────────────────┴────────────┘
└───────────────────────┘           Todas empresas sempre visíveis!
```

### Mudança 2: Altura Dinâmica do ScrollArea
Alterar o cálculo de altura para usar mais espaço disponível:
- De: `max-h-[calc(100vh-300px)]`
- Para: `max-h-[calc(100vh-200px)]` ou usar `flex-1` com container flex

### Mudança 3: Adicionar Filtro "Em Trial"
Novo filtro no Select de status para mostrar empresas em período de trial:
- Adicionar opção "Em Trial" no dropdown
- Mostrar badge especial "Trial" com dias restantes
- Adicionar contador de empresas em trial nas estatísticas rápidas

### Mudança 4: Badge de Trial na Tabela
Adicionar indicador visual quando empresa está em trial:
- Badge azul "Trial 5d" indicando dias restantes
- Badge laranja "Trial 2d" quando <= 2 dias
- Badge vermelho "Expirado" quando trial acabou

---

## Arquivos a Modificar

### `src/components/global-admin/CompanyUsageTable.tsx`

1. **Importar Sheet** do shadcn para painel lateral
2. **Substituir linha expandida** por Sheet deslizante
3. **Adicionar filtro "trial"** no StatusFilter type e SelectContent
4. **Criar componente TrialBadge** para exibir status do trial
5. **Adicionar contador de trials** nas estatísticas rápidas
6. **Ajustar altura** do ScrollArea

### Mudanças Específicas:

**1. Tipo de filtro (linha 109):**
```typescript
type StatusFilter = "all" | "active" | "pending" | "suspended" | "blocked" | "cancelled" | "critical" | "warning" | "trial";
```

**2. Interface CompanyWithStatus (linha 100-107):**
```typescript
interface CompanyWithStatus extends CompanyUsage {
  // ... campos existentes ...
  trial_type?: string | null;
  trial_ends_at?: string | null;
  trial_started_at?: string | null;
}
```

**3. Query para incluir dados de trial (linha 240-248):**
```typescript
const { data: companyData } = await supabase
  .from("companies")
  .select("id, status, created_at, law_firm_id, trial_type, trial_ends_at, trial_started_at");
```

**4. Filtro de trial (linha 341-367):**
```typescript
if (statusFilter === "trial") {
  return company.trial_type && company.trial_type !== 'none' && company.trial_ends_at;
}
```

**5. Estatísticas de trial (linha 371-379):**
```typescript
const stats = useMemo(() => {
  // ... existente ...
  return {
    total: companies.length,
    active: ...,
    pending: ...,
    suspended: ...,
    trial: companies.filter((c) => c.trial_type && c.trial_type !== 'none').length,
  };
}, [companies]);
```

**6. Sheet lateral para detalhes (substituindo linha expandida 664-817):**
```typescript
<Sheet open={!!expandedRow} onOpenChange={(open) => !open && setExpandedRow(null)}>
  <SheetContent side="right" className="w-[400px] sm:w-[540px] bg-[#1a1a1a] border-white/10">
    <SheetHeader>
      <SheetTitle className="text-white">Detalhes da Empresa</SheetTitle>
    </SheetHeader>
    {/* Conteúdo do painel de detalhes aqui */}
  </SheetContent>
</Sheet>
```

**7. Componente TrialBadge:**
```typescript
function TrialBadge({ company }: { company: CompanyWithStatus }) {
  if (!company.trial_type || company.trial_type === 'none' || !company.trial_ends_at) return null;
  
  const daysLeft = differenceInDays(new Date(company.trial_ends_at), new Date());
  
  if (daysLeft < 0) {
    return <Badge className="bg-red-500/20 text-red-400">Expirado</Badge>;
  }
  if (daysLeft <= 2) {
    return <Badge className="bg-orange-500/20 text-orange-400">Trial {daysLeft}d</Badge>;
  }
  return <Badge className="bg-blue-500/20 text-blue-400">Trial {daysLeft}d</Badge>;
}
```

---

## Benefícios

1. **Todas empresas sempre visíveis** - Sheet lateral não bloqueia a tabela
2. **Mais espaço para conteúdo** - altura otimizada do ScrollArea
3. **Monitoramento de trials** - filtro e badge para acompanhar empresas em teste
4. **UX melhorada** - navegação mais fluída entre empresas

---

## Testes Recomendados

1. Expandir empresa e verificar que outras continuam visíveis
2. Verificar scroll até o final da lista
3. Filtrar por "Em Trial" e verificar que mostra apenas empresas em período de teste
4. Verificar badge de trial com dias restantes corretos

