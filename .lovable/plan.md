# Integração Stripe - Status

## ✅ Implementado

| Item | Status |
|------|--------|
| Colunas `stripe_customer_id` e `stripe_subscription_id` | ✅ Migração aplicada |
| Edge Function `stripe-webhook` | ✅ Criada e deployada |
| Edge Function `list-stripe-invoices` | ✅ Criada e deployada |
| Edge Function `update-stripe-subscription` | ✅ Criada e deployada |
| `verify-payment` atualizado para salvar Stripe IDs | ✅ Modificado |
| `config.toml` com webhook JWT disabled | ✅ Atualizado |
| Secret `STRIPE_WEBHOOK_SECRET` | ✅ Configurado |

## ⚠️ Ação Manual Necessária

### Configurar Webhook no Painel Stripe

1. Acessar: https://dashboard.stripe.com/webhooks
2. Clicar em "Add endpoint"
3. URL: `https://jiragtersejnarxruqyd.supabase.co/functions/v1/stripe-webhook`
4. Selecionar eventos:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. O Webhook Signing Secret já foi configurado como `STRIPE_WEBHOOK_SECRET`

### Criar Produtos Basic no Stripe (Opcional)

Os Price IDs do plano Basic precisam ser criados no painel Stripe e atualizados em `create-checkout-session`.

## Próxima Etapa

Após configurar o webhook no Stripe, alterar `payment_provider` para `"stripe"` na tabela `system_settings` para ativar a nova integração.


