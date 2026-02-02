
# Plano: Remover Trial do Pagamento Direto

## Diagnóstico

O problema está na Edge Function `create-checkout-session`:

```typescript
// Linha 119-125 - PROBLEMA
subscription_data: {
  trial_period_days: 7, // ← SEMPRE aplica trial!
  metadata: { ... }
},
```

Quando o cliente clica em **"Pagar Agora"**, ele espera ser cobrado imediatamente, mas o Stripe está oferecendo 7 dias grátis porque o `trial_period_days` está hardcoded.

---

## Solução

Remover o `trial_period_days` do fluxo de pagamento direto. O trial só deve existir quando o cliente escolhe explicitamente a opção "Trial Grátis" (que usa a função `register-company`).

### Alteração no Backend

**Arquivo:** `supabase/functions/create-checkout-session/index.ts`

**Antes (linha 119-125):**
```typescript
subscription_data: {
  trial_period_days: 7, // 7-day trial, auto-charges on day 8
  metadata: {
    plan: planKey,
    company_name: companyName,
  },
},
```

**Depois:**
```typescript
subscription_data: {
  metadata: {
    plan: planKey,
    company_name: companyName,
  },
},
```

---

## Comportamento Esperado Após Correção

| Opção | Comportamento |
|-------|---------------|
| **Pagar Agora** | Cobra imediatamente via Stripe, sem trial |
| **Trial Grátis** | Ativa período de teste de 7 dias sem cobrança |

---

## Arquivo a Modificar

1. **`supabase/functions/create-checkout-session/index.ts`**
   - Linha 120: Remover `trial_period_days: 7`

---

## Fluxos Após Correção

```text
┌─────────────────────────────────────────────────────────────────┐
│                       CHECKOUT MODAL                             │
└─────────────────────────────────────────────────────────────────┘
                    │                           │
                    ▼                           ▼
         ┌──────────────────┐        ┌──────────────────┐
         │  💳 Pagar Agora  │        │  🎁 Trial Grátis │
         └────────┬─────────┘        └────────┬─────────┘
                  │                           │
                  ▼                           ▼
     ┌────────────────────────┐    ┌────────────────────────┐
     │ create-checkout-session│    │   register-company     │
     │ (SEM trial_period_days)│    │ (status: trialing)     │
     └────────────────────────┘    └────────────────────────┘
                  │                           │
                  ▼                           ▼
     ┌────────────────────────┐    ┌────────────────────────┐
     │  Stripe Checkout       │    │  Empresa criada com    │
     │  COBRA IMEDIATAMENTE   │    │  7 dias de trial grátis│
     └────────────────────────┘    └────────────────────────┘
```
