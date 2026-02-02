

# Análise: Status da Integração Stripe vs ASAAS

## Resumo Executivo

A integração Stripe já está **parcialmente implementada**, mas falta funcionalidades críticas para substituir completamente o ASAAS. A boa notícia é que a chave `STRIPE_SECRET_KEY` já está configurada.

---

## Status Atual das Integrações

### Stripe ✅ Parcial

| Funcionalidade | Status | Arquivo |
|----------------|--------|---------|
| Checkout de assinatura | ✅ OK | `create-checkout-session` |
| Verificação após pagamento | ✅ OK | `verify-payment` |
| Métricas no admin | ✅ OK | `get-payment-metrics` |
| Chave API | ✅ Configurada | `STRIPE_SECRET_KEY` |
| Webhook de eventos | ❌ **NÃO EXISTE** | - |
| Listar faturas do cliente | ❌ **NÃO EXISTE** | - |
| Atualizar valor da assinatura | ❌ **NÃO EXISTE** | - |

### ASAAS ✅ Completo

| Funcionalidade | Status | Arquivo |
|----------------|--------|---------|
| Checkout de assinatura | ✅ OK | `create-asaas-checkout` |
| Webhook de eventos | ✅ OK | `asaas-webhook` |
| Listar faturas do cliente | ✅ OK | `list-asaas-invoices` |
| Atualizar valor da assinatura | ✅ OK | `update-asaas-subscription` |
| Métricas no admin | ✅ OK | `get-payment-metrics` |

---

## O Que Falta Para Substituir o ASAAS

### 1. Stripe Webhook (CRÍTICO)

O ASAAS usa webhook para:
- Confirmar pagamentos automaticamente
- Atualizar status de assinaturas (ativo/cancelado/vencido)
- Ativar empresas após primeiro pagamento

**Arquivo a criar:** `supabase/functions/stripe-webhook/index.ts`

**Eventos a tratar:**
- `checkout.session.completed` - Provisionar empresa
- `invoice.paid` - Marcar assinatura como ativa
- `invoice.payment_failed` - Marcar como inadimplente
- `customer.subscription.deleted` - Cancelar acesso

### 2. Listar Faturas do Cliente

Para que clientes vejam suas faturas na área "Meu Plano".

**Arquivo a criar:** `supabase/functions/list-stripe-invoices/index.ts`

### 3. Atualizar Valor da Assinatura (Addons)

Quando admin aprova adicional de usuários/instâncias, o valor da assinatura precisa ser atualizado no Stripe.

**Arquivo a criar:** `supabase/functions/update-stripe-subscription/index.ts`

### 4. Adicionar Colunas na Tabela

A tabela `company_subscriptions` atualmente tem:
- `asaas_customer_id`
- `asaas_subscription_id`

**Precisa adicionar:**
- `stripe_customer_id`
- `stripe_subscription_id`

---

## Price IDs do Stripe (Já Configurados)

Os planos Starter, Professional e Enterprise já têm Price IDs no Stripe:

```typescript
const PLAN_PRICES = {
  basic: {
    monthly: "price_basic_monthly", // ⚠️ TODO: Criar no Stripe
    yearly: "price_basic_yearly"    // ⚠️ TODO: Criar no Stripe
  },
  starter: {
    monthly: "price_1Sn4HqPuIhszhOCIJeKQV8Zw", // ✅ OK
    yearly: "price_1Sn4K7PuIhszhOCItPywPXua"   // ✅ OK
  },
  professional: {
    monthly: "price_1Sn4I3PuIhszhOCIkzaV5obi", // ✅ OK
    yearly: "price_1Sn4KcPuIhszhOCIe4PRabMr"   // ✅ OK
  },
  enterprise: {
    monthly: "price_1Sn4IJPuIhszhOCIIzHxe05Q", // ✅ OK
    yearly: "price_1Sn4KnPuIhszhOCIGtWyHEST"   // ✅ OK
  }
};
```

**Ação necessária:** Criar produtos Basic no painel do Stripe e atualizar os IDs.

---

## Fluxo de Substituição

```text
           ┌─────────────────────────────────────────────┐
           │           ETAPAS DE MIGRAÇÃO                │
           └─────────────────────────────────────────────┘
                              │
    ┌─────────────────────────┼─────────────────────────┐
    │                         │                         │
    ▼                         ▼                         ▼
┌───────────┐          ┌───────────┐          ┌───────────┐
│ ETAPA 1   │          │ ETAPA 2   │          │ ETAPA 3   │
│ Banco     │          │ Funções   │          │ Frontend  │
└───────────┘          └───────────┘          └───────────┘
    │                         │                         │
    ├─ Adicionar              ├─ stripe-webhook         ├─ Configurar
    │  stripe_customer_id     │                         │  payment_provider
    │                         ├─ list-stripe-invoices   │  = "stripe"
    ├─ Adicionar              │                         │
    │  stripe_subscription_id ├─ update-stripe-         │
    │                         │  subscription           │
    └─────────────────────────┴─────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ CONFIGURAR URL  │
                    │ DO WEBHOOK NO   │
                    │ PAINEL STRIPE   │
                    └─────────────────┘
```

---

## Arquivos a Criar

| Ordem | Arquivo | Descrição | Complexidade |
|-------|---------|-----------|--------------|
| 1 | Migração SQL | Adicionar colunas stripe_* | Baixa |
| 2 | `stripe-webhook/index.ts` | Handler de eventos Stripe | Alta |
| 3 | `list-stripe-invoices/index.ts` | Listar faturas do cliente | Média |
| 4 | `update-stripe-subscription/index.ts` | Atualizar valor da assinatura | Média |

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `verify-payment/index.ts` | Salvar `stripe_customer_id` e `stripe_subscription_id` |
| `supabase/config.toml` | Adicionar `[functions.stripe-webhook]` com `verify_jwt = false` |
| `src/components/settings/MyPlanSettings.tsx` | Usar `list-stripe-invoices` quando provider=stripe |

---

## Configuração do Webhook no Stripe

Após criar a função `stripe-webhook`, você precisará:

1. Acessar: https://dashboard.stripe.com/webhooks
2. Adicionar endpoint: `https://jiragtersejnarxruqyd.supabase.co/functions/v1/stripe-webhook`
3. Selecionar eventos:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copiar o **Webhook Signing Secret** e adicionar como `STRIPE_WEBHOOK_SECRET`

---

## Próximos Passos (Ordem Recomendada)

1. **Criar produtos Basic no Stripe** (manual no painel)
2. **Adicionar colunas stripe_* na tabela** (migração)
3. **Criar stripe-webhook** (provisioning automático)
4. **Criar list-stripe-invoices** (visualização de faturas)
5. **Criar update-stripe-subscription** (addons)
6. **Modificar verify-payment** (salvar IDs do Stripe)
7. **Configurar webhook no painel Stripe**
8. **Mudar payment_provider para "stripe"** no admin

---

## Estimativa de Tempo

| Item | Tempo Estimado |
|------|----------------|
| Migração SQL | 5 min |
| stripe-webhook | 30-40 min |
| list-stripe-invoices | 15-20 min |
| update-stripe-subscription | 15-20 min |
| Ajustes verify-payment | 10 min |
| Testes e ajustes | 30 min |
| **Total** | **~2 horas** |

