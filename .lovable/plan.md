
# Plano: Sistema de Acompanhamento de Cobranças e Inadimplência

## Situação Atual

### 1. Data de Vencimento
**Problema**: O vencimento é calculado como "7 dias a partir da criação da assinatura", não como "dia fixo mensal baseado no cadastro".

```typescript
// Código atual
const nextDueDate = new Date();
nextDueDate.setDate(nextDueDate.getDate() + 7);
```

**Comportamento esperado**: Se a empresa foi cadastrada dia 15, o vencimento deveria ser todo dia 15 de cada mês.

### 2. Acompanhamento de Inadimplência
**Problema**: O Dashboard de Pagamentos atual (`GlobalAdminPayments.tsx`) não oferece:
- Lista de empresas inadimplentes
- Filtros por status de pagamento
- Alertas de vencimento próximo
- Ações de cobrança

---

## Solução Proposta

### Parte 1: Vencimento Baseado na Data de Cadastro

Modificar `admin-create-asaas-subscription/index.ts` para calcular o vencimento usando a data de aprovação/criação da empresa:

```typescript
// Buscar data de aprovação ou criação da empresa
const companyCreatedAt = new Date(company.approved_at || company.created_at);
const dayOfMonth = companyCreatedAt.getDate();

// Calcular próximo vencimento no mesmo dia do mês
const nextDueDate = new Date();
if (nextDueDate.getDate() >= dayOfMonth) {
  // Já passou este mês, vai para o próximo
  nextDueDate.setMonth(nextDueDate.getMonth() + 1);
}
nextDueDate.setDate(Math.min(dayOfMonth, getDaysInMonth(nextDueDate)));
```

### Parte 2: Novo Painel de Acompanhamento Financeiro

Adicionar nova aba "Inadimplência" no Dashboard de Pagamentos com:

```text
┌─────────────────────────────────────────────────────────────────┐
│  DASHBOARD DE PAGAMENTOS                                        │
│                                                                  │
│  [Visão Geral] [Inadimplência] [Vencimentos]                    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  📊 RESUMO RÁPIDO                                           ││
│  │                                                              ││
│  │  🔴 3 Vencidas    🟡 5 Pendentes    🟢 12 Em Dia            ││
│  │  Total em atraso: R$ 4.590,00                               ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  EMPRESAS INADIMPLENTES                                     ││
│  │                                                              ││
│  │  🔴 FMO Advogados         R$ 2.128,30    15 dias atraso     ││
│  │     Plano: ENTERPRISE     Venceu: 14/01/2026                ││
│  │     [📧 Cobrar] [⚠️ Bloquear] [📋 Ver Histórico]            ││
│  │                                                              ││
│  │  🔴 Empresa XYZ           R$ 897,00      8 dias atraso      ││
│  │     Plano: PROFESSIONAL   Venceu: 21/01/2026                ││
│  │     [📧 Cobrar] [⚠️ Bloquear] [📋 Ver Histórico]            ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  PRÓXIMOS VENCIMENTOS (7 DIAS)                              ││
│  │                                                              ││
│  │  🟡 30/01 - Suporte MiauChat      R$ 197,00    (amanhã)     ││
│  │  🟡 01/02 - Jr Importados         R$ 497,00    (3 dias)     ││
│  │  🟡 05/02 - Liz Importados        R$ 897,00    (7 dias)     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Parte 3: Nova Edge Function para Buscar Status de Pagamentos

Criar `get-billing-status/index.ts` que busca do ASAAS:

```typescript
// Buscar todas as cobranças pendentes e vencidas
const overduePayments = await fetch(
  `${asaasBaseUrl}/payments?status=OVERDUE&limit=100`,
  { headers: { "access_token": asaasApiKey } }
);

const pendingPayments = await fetch(
  `${asaasBaseUrl}/payments?status=PENDING&limit=100`,
  { headers: { "access_token": asaasApiKey } }
);

// Retornar com dados enriquecidos (nome da empresa, dias em atraso)
return {
  overdue: overduePayments.map(p => ({
    ...p,
    daysOverdue: diffDays(new Date(), new Date(p.dueDate)),
    companyName: findCompanyByAsaasId(p.customer)
  })),
  pending: pendingPayments,
  summary: {
    totalOverdue: overduePayments.length,
    totalPending: pendingPayments.length,
    totalAmountOverdue: sum(overduePayments.map(p => p.value))
  }
}
```

### Parte 4: Salvar Vencimento no Banco

Adicionar coluna para rastrear vencimentos localmente:

```sql
-- Já existe next_payment_at em company_subscriptions
-- Vamos usar para exibir no painel
UPDATE company_subscriptions 
SET next_payment_at = (asaas_next_due_date)
WHERE asaas_subscription_id IS NOT NULL;
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/admin-create-asaas-subscription/index.ts` | Modificar | Calcular vencimento baseado na data de aprovação |
| `supabase/functions/get-billing-status/index.ts` | Criar | Buscar cobranças pendentes/vencidas do ASAAS |
| `src/pages/global-admin/GlobalAdminPayments.tsx` | Modificar | Adicionar abas de Inadimplência e Vencimentos |
| `src/components/global-admin/BillingOverdueList.tsx` | Criar | Componente para listar inadimplentes |
| `src/components/global-admin/UpcomingPaymentsList.tsx` | Criar | Componente para próximos vencimentos |

---

## Detalhes Técnicos

### Fluxo do Cálculo de Vencimento

```text
┌─────────────────────────┐
│ Empresa aprovada        │
│ Data: 15/01/2026        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│ Gerar assinatura:                               │
│                                                 │
│ 1. Buscar company.approved_at = 15/01          │
│ 2. dayOfMonth = 15                              │
│ 3. Hoje = 29/01, já passou dia 15              │
│ 4. nextDueDate = 15/02/2026                    │
└───────────┬─────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│ ASAAS cria subscription com:                   │
│ - nextDueDate: 15/02/2026                       │
│ - cycle: MONTHLY                                │
│ - Próximos: 15/03, 15/04, 15/05...             │
└─────────────────────────────────────────────────┘
```

### Estrutura da Nova Edge Function

```typescript
// get-billing-status/index.ts
interface BillingStatusResponse {
  summary: {
    totalOverdue: number;
    totalPending: number;
    totalAmountOverdue: number;
    totalAmountPending: number;
  };
  overdue: {
    paymentId: string;
    customerId: string;
    companyId: string;
    companyName: string;
    planName: string;
    value: number;
    dueDate: string;
    daysOverdue: number;
    invoiceUrl: string;
  }[];
  pending: { /* similar */ }[];
  upcomingThisWeek: {
    companyId: string;
    companyName: string;
    value: number;
    dueDate: string;
    daysUntilDue: number;
  }[];
}
```

### Enriquecimento com Dados Locais

Para exibir o nome da empresa ao lado de cada cobrança:

```typescript
// Buscar mapeamento customer_id -> company
const { data: subscriptions } = await supabase
  .from("company_subscriptions")
  .select("company_id, asaas_customer_id, companies(name, plan:plans(name))");

// Criar lookup map
const customerToCompany = new Map(
  subscriptions.map(s => [s.asaas_customer_id, s.companies])
);

// Enriquecer dados do ASAAS
overduePayments.map(payment => ({
  ...payment,
  companyName: customerToCompany.get(payment.customer)?.name || "Desconhecido",
  planName: customerToCompany.get(payment.customer)?.plan?.name || "-"
}));
```

---

## Benefícios

1. **Vencimento Previsível**: Cliente sempre sabe que vence no mesmo dia do mês
2. **Visibilidade Total**: Admin vê rapidamente quem está inadimplente
3. **Ação Rápida**: Botões para cobrar, bloquear ou ver histórico
4. **Prevenção**: Alertas de vencimentos próximos para contato proativo
5. **Métricas**: Total em atraso para decisões financeiras
