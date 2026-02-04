

# Plano: Melhorar Relatório PDF de Empresas com Dados de Faturamento Stripe

## Problema Identificado

No PDF atual, a empresa "Miau test" aparece como "Trial Expirado" quando na verdade ela:
1. **Pagou a fatura** (subscription `sub_1Sx89k...` status: `active`)
2. **Está ativa** (company status: `active`, subscription status: `active`)
3. O trial expirou, mas ela **converteu para pagante**

A lógica atual no `getStatusText()` verifica `trial_ends_at` sem considerar se há uma assinatura ativa.

---

## Mudanças Necessárias

### 1. Corrigir Lógica de Status

**Arquivo:** `src/lib/companyReportGenerator.ts`

A função `getStatusText()` precisa considerar:
```text
PRIORIDADE DE STATUS:
1. suspended/blocked → Mostrar status
2. pending_approval → "Pendente"
3. subscription_status === 'active' → "Ativo (Pagante)" ← NOVO
4. trial ativo (trial_ends_at > hoje) → "Trial (Xd)"
5. trial expirado SEM subscription → "Trial Expirado"
6. status === 'active' → "Ativo"
```

### 2. Adicionar Novos Campos ao Relatório

**Campos atuais no PDF:**
- Nome, CPF/CNPJ, Plano, Status, Ativo, Ativação, Faturas, Valor Pendente

**Novos campos a adicionar:**
| Campo | Origem | Descrição |
|-------|--------|-----------|
| **Data do Pagamento** | `last_payment_at` ou Stripe `status_transitions.paid_at` | Quando pagou a última fatura |
| **Próxima Fatura** | `current_period_end` ou Stripe subscription | Data do próximo vencimento |

### 3. Atualizar Interface de Dados

**Arquivo:** `src/lib/companyReportGenerator.ts`

```typescript
interface CompanyReportData {
  name: string;
  document: string | null;
  planName: string;
  status: string;
  approvalStatus: string;
  isActive: boolean;
  approvedAt: string | null;
  trialDaysRemaining: number | null;
  openInvoicesCount: number;
  openInvoicesTotal: number;
  // NOVOS CAMPOS:
  hasActiveSubscription: boolean;      // Se tem subscription ativa
  lastPaymentAt: string | null;        // Data do último pagamento
  nextInvoiceAt: string | null;        // Data da próxima fatura
  subscriptionStatus: string | null;   // Status da subscription Stripe
}
```

### 4. Modificar Busca de Dados

**Arquivo:** `src/pages/global-admin/GlobalAdminCompanies.tsx`

Na função de exportação PDF, adicionar:

```typescript
// Buscar dados da subscription junto com company
const { data: subscription } = await supabase
  .from("company_subscriptions")
  .select("stripe_subscription_id, status, last_payment_at, current_period_end")
  .eq("company_id", company.id)
  .maybeSingle();

// Se tem subscription ativa no Stripe, buscar datas do Stripe
if (subscription?.stripe_subscription_id) {
  // Chamar Stripe API para pegar current_period_end atualizado
}
```

### 5. Criar Edge Function para Dados Completos (Opcional)

Se os dados do banco não estiverem atualizados, criar uma edge function:

**Novo arquivo:** `supabase/functions/get-company-billing-summary/index.ts`

```typescript
// Busca dados de billing resumidos para o relatório:
// - subscription status
// - last payment date (da última fatura paga)
// - next invoice date (current_period_end)
// - open invoices count/total
```

---

## Layout do Novo PDF

### Antes (8 colunas):
```text
Nome | CPF/CNPJ | Plano | Status | Ativo | Ativação | Faturas | Valor Pendente
```

### Depois (9 colunas - layout otimizado):
```text
Nome | CPF/CNPJ | Plano | Status | Ativo | Ativação | Últ. Pgto | Próx. Fat. | Faturas Abertas
```

**Observações:**
- Combinar "Faturas" e "Valor Pendente" em uma coluna: "2 (R$ 179,40)"
- "Últ. Pgto" = Data do último pagamento
- "Próx. Fat." = Data da próxima fatura

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/lib/companyReportGenerator.ts` | Adicionar novos campos na interface, corrigir `getStatusText()`, ajustar layout |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Buscar dados de subscription e enriquecer relatório |
| (Opcional) `supabase/functions/get-company-billing-summary/index.ts` | Nova função para buscar dados consolidados |

---

## Lógica de Status Corrigida

```typescript
function getStatusText(company: CompanyReportData): string {
  // 1. Status de bloqueio tem prioridade máxima
  if (company.status === "suspended") return "Suspenso";
  if (company.status === "blocked") return "Bloqueado";
  if (company.approvalStatus === "pending") return "Pendente";
  
  // 2. Se tem subscription ativa = é pagante
  if (company.hasActiveSubscription) {
    return "Ativo";  // ← Ignora trial_ends_at
  }
  
  // 3. Se está em trial
  if (company.trialDaysRemaining !== null) {
    if (company.trialDaysRemaining > 0) {
      return `Trial (${company.trialDaysRemaining}d)`;
    } else {
      return "Trial Expirado";
    }
  }
  
  // 4. Fallback
  if (company.status === "active") return "Ativo";
  return company.status;
}
```

---

## Resultado Esperado

**Antes (errado):**
| Nome | Status | Ativação | Faturas |
|------|--------|----------|---------|
| Miau test | Trial Expirado | 28/01/2026 | 0 |

**Depois (correto):**
| Nome | Status | Ativação | Últ. Pgto | Próx. Fat. | Faturas |
|------|--------|----------|-----------|------------|---------|
| Miau test | Ativo | 28/01/2026 | 04/02/2026 | 04/03/2026 | - |

---

## Impacto

- **Zero quebra**: Apenas adiciona informações ao PDF
- **Melhora UX**: Status mais preciso e informativo
- **Valor comercial**: Relatório completo para gestão financeira

