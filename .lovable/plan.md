
# Plano: Melhorar Visibilidade de Status de Empresas no Dashboard

## Problema Identificado

O dashboard atual mostra métricas imprecisas:
- **Mostra**: "7 empresas ativas" (usa `status === 'active'`)
- **Realidade**: Apenas **5 empresas realmente ativas**, 1 em trial e 1 aguardando aprovação

O campo `status` tem valor "active" por padrão, mas não reflete o estado real da empresa que depende de:
- `approval_status` (pending_approval, approved, rejected)
- `trial_type` e `trial_ends_at`

## Dados Reais do Sistema

| Categoria | Quantidade |
|-----------|------------|
| Empresas Ativas (approved, não trial) | 5 |
| Em Trial Ativo | 1 |
| Aguardando Aprovação | 1 |
| **Total Real** | **7** |

---

## Alterações Propostas

### 1. Expandir Interface `DashboardMetrics` (`useSystemMetrics.tsx`)

Adicionar novas métricas granulares:

```typescript
interface DashboardMetrics {
  // Contagens existentes
  totalCompanies: number;
  activeCompanies: number;  // Mantido para compatibilidade
  
  // NOVAS MÉTRICAS GRANULARES
  companiesApproved: number;      // approved + não em trial
  companiesPendingApproval: number;
  companiesInTrial: number;       // trial ativo (não expirado)
  companiesTrialExpired: number;  // trial expirado
  companiesRejected: number;
  
  // ... resto existente
}
```

### 2. Atualizar Query de Métricas (`useSystemMetrics.tsx`)

Modificar a query para buscar dados granulares:

```typescript
// Buscar contagens por categoria
const { data: companiesData } = await supabase
  .from("companies")
  .select("id, status, approval_status, trial_type, trial_ends_at");

// Calcular categorias
const now = new Date();
let companiesApproved = 0;
let companiesPendingApproval = 0;
let companiesInTrial = 0;
let companiesTrialExpired = 0;
let companiesRejected = 0;

companiesData?.forEach(company => {
  if (company.approval_status === 'pending_approval') {
    companiesPendingApproval++;
  } else if (company.approval_status === 'rejected') {
    companiesRejected++;
  } else if (company.trial_type && company.trial_type !== 'none' && company.trial_ends_at) {
    if (new Date(company.trial_ends_at) > now) {
      companiesInTrial++;
    } else {
      companiesTrialExpired++;
    }
  } else if (company.approval_status === 'approved') {
    companiesApproved++;
  }
});
```

### 3. Redesenhar Cards de Estatísticas (`GlobalAdminDashboard.tsx`)

Substituir os 4 cards atuais por versão mais informativa:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  DASHBOARD GLOBAL ADMIN - NOVA VERSÃO                                                               │
│                                                                                                      │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────────┐ │
│  │ 🏢 EMPRESAS         │ │ ✅ ATIVAS           │ │ 🔵 EM TRIAL         │ │ ⚠️ PENDENTES           │ │
│  │                     │ │                     │ │                     │ │                         │ │
│  │     7               │ │     5               │ │     1               │ │     1                   │ │
│  │                     │ │                     │ │     (expira em 5d)  │ │   Aguardando aprovação  │ │
│  │ Total cadastradas   │ │ Em operação         │ │                     │ │                         │ │
│  └─────────────────────┘ └─────────────────────┘ └─────────────────────┘ └─────────────────────────┘ │
│                                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Novos Cards:**

| Card | Título | Dados | Cor |
|------|--------|-------|-----|
| 1 | Total de Empresas | `totalCompanies` | Vermelho |
| 2 | Empresas Ativas | `companiesApproved` (approved + não trial) | Verde |
| 3 | Em Trial | `companiesInTrial` + dias para expirar | Azul |
| 4 | Pendentes | `companiesPendingApproval` (aguardando aprovação) | Amarelo |

### 4. Atualizar Gráfico de Pizza

Novo data source mais preciso:

```typescript
const pieChartData = [
  { name: "Ativas", value: dashboardMetrics?.companiesApproved || 0, color: "#22c55e" },
  { name: "Em Trial", value: dashboardMetrics?.companiesInTrial || 0, color: "#3b82f6" },
  { name: "Pendentes", value: dashboardMetrics?.companiesPendingApproval || 0, color: "#f59e0b" },
  { name: "Trial Expirado", value: dashboardMetrics?.companiesTrialExpired || 0, color: "#ef4444" },
].filter(item => item.value > 0);
```

### 5. Adicionar Link Rápido nos Cards

Cards clicáveis que filtram a tabela de empresas:

```typescript
{
  title: "Pendentes",
  value: dashboardMetrics?.companiesPendingApproval || 0,
  onClick: () => navigate("/global-admin/companies?tab=pending"),
}
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useSystemMetrics.tsx` | Adicionar novas métricas granulares por approval_status e trial |
| `src/pages/global-admin/GlobalAdminDashboard.tsx` | Atualizar cards e gráfico de pizza com novos dados |

---

## Benefícios

1. **Visibilidade Real**: Dashboard mostra exatamente quantas empresas estão em cada estado
2. **Proatividade**: Fácil identificar empresas em trial próximo de expirar
3. **Ação Rápida**: Cards clicáveis levam direto para a lista filtrada
4. **MRR Preciso**: Revenue calculado apenas de empresas ativas (não trial/pendentes)

---

## Comparação Visual

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ANTES                                                                   │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐                │
│  │ Total: 7  │ │ Ativas: 7 │ │ Users: 8  │ │ Alertas:0 │                │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘                │
│                                                                          │
│  Gráfico: [████████ Ativas 7] (100%)                                    │
└─────────────────────────────────────────────────────────────────────────┘

                                    ↓

┌─────────────────────────────────────────────────────────────────────────┐
│  DEPOIS                                                                  │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐                │
│  │ Total: 7  │ │ Ativas: 5 │ │ Trial: 1  │ │ Pend.: 1  │                │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘                │
│                                                                          │
│  Gráfico: [████ Ativas 5] [█ Trial 1] [█ Pendentes 1]                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Regra de Classificação Final

```
SE approval_status = 'pending_approval' → "Aguardando Aprovação" 🟡
SE approval_status = 'rejected' → "Rejeitada" 🔴
SE trial_type != 'none' E trial_ends_at > NOW() → "Em Trial" 🔵
SE trial_type != 'none' E trial_ends_at <= NOW() → "Trial Expirado" 🟠
SE approval_status = 'approved' → "Ativa" 🟢
```
