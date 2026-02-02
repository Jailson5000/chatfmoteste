
# Plano: Remoção Segura do ASAAS

## ✅ CONCLUÍDO

Todas as referências ao ASAAS foram removidas do projeto. Apenas o Stripe permanece como provedor de pagamento.

---

## Alterações Realizadas

### Edge Functions Deletadas (5 funções)
- ✅ `admin-create-asaas-subscription`
- ✅ `asaas-webhook`
- ✅ `create-asaas-checkout`
- ✅ `list-asaas-invoices`
- ✅ `update-asaas-subscription`

### Frontend Simplificado (3 arquivos)
- ✅ `src/pages/Register.tsx` - Chama diretamente `create-checkout-session` (Stripe)
- ✅ `src/components/landing/CheckoutModal.tsx` - Removido provider selection, usa Stripe
- ✅ `src/hooks/useAddonRequests.tsx` - Removida chamada a `update-asaas-subscription`

### Configuração (1 arquivo)
- ✅ `supabase/config.toml` - Removida entrada `[functions.asaas-webhook]`

### Admin UI (1 arquivo)
- ✅ `src/pages/global-admin/GlobalAdminSettings.tsx` - Removido RadioGroup de provider selection

### Edge Function Simplificada (1 arquivo)
- ✅ `supabase/functions/get-payment-metrics/index.ts` - Removida toda lógica ASAAS

---

## O que foi preservado

- Colunas do banco: `asaas_customer_id`, `asaas_subscription_id` (histórico)
- `billing_type` constraint: Mantém suporte a "asaas" para dados históricos

---

## Resultado

- ✅ Checkout funciona via Stripe
- ✅ Trial funciona normalmente  
- ✅ Aprovação de addons não tenta chamar ASAAS
- ✅ Métricas mostram apenas Stripe
- ✅ Nenhuma menção a ASAAS na UI
