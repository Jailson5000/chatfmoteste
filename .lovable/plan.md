
# Plano: Corrigir Inconsistência de Datas + Adicionar Ciclo de Faturamento

## Problemas Identificados

### 1. Bug de Timezone nas Datas (01/02 vs 02/02)

**Causa Raiz:**
- O Stripe retorna `dueDate` como timestamp Unix, convertido para ISO string (ex: `2026-02-02T00:00:00.000Z`)
- Quando o frontend faz `new Date("2026-02-02T00:00:00.000Z")`, interpreta como **meia-noite UTC**
- Para fuso horário Brasil (UTC-3), meia-noite UTC = 21:00 do dia **anterior** (01/02)
- Resultado: Dashboard mostra "01/02" enquanto Stripe e faturas mostram "02/02"

**Locais Afetados:**
- `BillingOverdueList.tsx` linha 111: `format(new Date(payment.dueDate), "dd/MM/yyyy")`
- `MyPlanSettings.tsx` linha 745: `format(new Date(invoice.dueDate), "dd/MM/yyyy")`

**Solução:**
Usar a função `parseDateLocal()` do `src/lib/dateUtils.ts` que já existe no projeto:
```typescript
// Antes (bug de timezone)
format(new Date(payment.dueDate), "dd/MM/yyyy")

// Depois (correto)
import { parseDateLocal } from "@/lib/dateUtils";
format(parseDateLocal(payment.dueDate) || new Date(), "dd/MM/yyyy")
```

### 2. Falta do Ciclo de Faturamento (Início → Vencimento)

**Causa Raiz:**
Os campos `current_period_start`, `current_period_end`, `next_payment_at`, `last_payment_at` na tabela `company_subscriptions` estão **NULL** para todas as empresas.

O webhook do Stripe provavelmente não está atualizando esses campos corretamente.

**Verificação nos dados:**
```sql
SELECT current_period_start, current_period_end, next_payment_at 
FROM company_subscriptions LIMIT 5;
-- Resultado: todos NULL
```

**Solução em 2 partes:**

**Parte A:** Atualizar o `stripe-webhook` para sincronizar as datas do ciclo quando:
- `invoice.paid` - Atualizar `last_payment_at`
- `customer.subscription.created/updated` - Atualizar `current_period_start`, `current_period_end`

**Parte B:** Atualizar `MyPlanSettings.tsx` para mostrar o ciclo completo:
- Exibir "Assinatura iniciada em: {data_início}"
- Exibir "Próximo vencimento: {data_fim} (dia X de cada mês)"

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/global-admin/BillingOverdueList.tsx` | Usar `parseDateLocal()` para datas |
| `src/components/settings/MyPlanSettings.tsx` | Usar `parseDateLocal()` + mostrar ciclo completo |
| `supabase/functions/stripe-webhook/index.ts` | Sincronizar datas do ciclo |

---

## Detalhes da Implementação

### 1. Corrigir `BillingOverdueList.tsx`

```typescript
import { parseDateLocal } from "@/lib/dateUtils";

// Linha 111 - antes:
Venceu em: {format(new Date(payment.dueDate), "dd/MM/yyyy", { locale: ptBR })}

// Depois:
Venceu em: {format(parseDateLocal(payment.dueDate) || new Date(), "dd/MM/yyyy", { locale: ptBR })}
```

### 2. Corrigir `MyPlanSettings.tsx`

**Linha 745 - Diálogo de Faturas:**
```typescript
import { parseDateLocal } from "@/lib/dateUtils";

// Antes:
`Vence em ${format(new Date(invoice.dueDate), "dd/MM/yyyy")}`

// Depois:
`Vence em ${format(parseDateLocal(invoice.dueDate) || new Date(), "dd/MM/yyyy")}`
```

**Linhas 514-528 - Adicionar info de ciclo completo:**
```typescript
// Se tiver current_period_start, mostrar quando iniciou
{companyData?.subscription?.current_period_start && (
  <p className="text-xs text-muted-foreground">
    Ciclo iniciado em {format(parseDateLocal(companyData.subscription.current_period_start) || new Date(), "d 'de' MMMM", { locale: ptBR })}
  </p>
)}
```

### 3. Atualizar `stripe-webhook` para Sincronizar Ciclo

No evento `invoice.paid` ou `customer.subscription.updated`:

```typescript
// Atualizar campos de ciclo
await supabase
  .from("company_subscriptions")
  .update({
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    next_payment_at: new Date(subscription.current_period_end * 1000).toISOString(),
    last_payment_at: new Date().toISOString(),
  })
  .eq("stripe_subscription_id", subscription.id);
```

---

## Fluxo Esperado Após Correção

```text
┌─────────────────────────────────────────────────────────────────────┐
│  Dashboard Admin > Pagamentos > Inadimplência                       │
│  ─────────────────────────────────────────────────────────────────  │
│  Empresa X | R$ 197,00 | 0 dias em atraso                           │
│  Venceu em: 02/02/2026  ← CORRETO (antes: 01/02)                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Configurações > Plano > Ver Faturas                                │
│  ─────────────────────────────────────────────────────────────────  │
│  R$ 197,00 | Pendente                                               │
│  Vence em 02/02/2026 • Stripe  ← CORRETO (igual ao Admin)          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Configurações > Plano > Resumo Mensal                              │
│  ─────────────────────────────────────────────────────────────────  │
│  📅 Ciclo de faturamento                                            │
│  Iniciado em: 2 de janeiro de 2026                                  │
│  Próximo vencimento: 2 de fevereiro de 2026 (dia 2 de cada mês)    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Dados Necessários (Query de Subscription)

A query em `MyPlanSettings.tsx` (linha 96-100) já busca os campos corretos:
```typescript
const { data: subscription } = await supabase
  .from("company_subscriptions")
  .select("status, current_period_start, current_period_end, next_payment_at, last_payment_at")
  .eq("company_id", company.id)
  .maybeSingle();
```

O problema é que esses campos estão **NULL** porque o webhook não os popula.

---

## Risco de Quebrar o Sistema

**Baixo:**

1. **parseDateLocal**: Função já existe e é usada em outras partes do sistema
2. **Novo código de ciclo**: Apenas adiciona informação visual, com null-checks seguros
3. **Webhook update**: Adiciona lógica extra sem remover a existente

---

## Validações Pós-Implementação

- [ ] Data de vencimento no Dashboard Admin = Data no Stripe
- [ ] Data de vencimento nas Faturas do cliente = Data no Stripe
- [ ] Ciclo de faturamento aparece no Resumo Mensal
- [ ] Funcionalidade de cobrança continua funcionando
- [ ] Suspensão/liberação de empresa continua funcionando
