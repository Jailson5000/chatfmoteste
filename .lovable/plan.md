
# Plano: Atualizar Price IDs do Basic e Guia de Testes

## 1. Arquivos a Modificar

### Atualização dos Price IDs do Stripe

| Arquivo | Linha | De | Para |
|---------|-------|-----|------|
| `admin-create-stripe-subscription` | 20-21 | `price_BASIC_MONTHLY`, `price_BASIC_YEARLY` | `price_1SwAujPssGNUXxgnzQ51nJCQ`, `price_1SwAujPssGNUXxgnEFJL0T6l` |
| `generate-payment-link` | 20-21 | `price_BASIC_MONTHLY`, `price_BASIC_YEARLY` | `price_1SwAujPssGNUXxgnzQ51nJCQ`, `price_1SwAujPssGNUXxgnEFJL0T6l` |
| `create-checkout-session` | 14-15 | `price_basic_monthly`, `price_basic_yearly` | `price_1SwAujPssGNUXxgnzQ51nJCQ`, `price_1SwAujPssGNUXxgnEFJL0T6l` |

---

## 2. Como Testar a Integração Stripe

### Passo 1: Verificar configuração do webhook

```text
URL: https://jiragtersejnarxruqyd.supabase.co/functions/v1/stripe-webhook
Eventos necessários:
- checkout.session.completed
- invoice.paid
- invoice.payment_failed
- customer.subscription.updated
- customer.subscription.deleted
```

### Passo 2: Testar fluxo completo pelo Admin Global

```text
┌────────────────────────────────────────────────────────────┐
│                   FLUXO DE TESTE                           │
└────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────┐
│ 1. Acesse /global-admin/companies                         │
│    (Você já está nesta página)                            │
└───────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────┐
│ 2. Clique em "Gerar Cobrança Stripe" em uma empresa       │
│    - Selecione período: Mensal ou Anual                   │
│    - Confirme a criação                                   │
└───────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────┐
│ 3. Verifique nos logs da Edge Function:                   │
│    - Subscription criada com sucesso                      │
│    - stripe_customer_id e stripe_subscription_id salvos   │
└───────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────┐
│ 4. O email com link de pagamento é enviado pelo Stripe    │
└───────────────────────────────────────────────────────────┘
```

### Passo 3: Testar pagamento (ambiente de teste)

```text
Cartão de teste Stripe:
- Número: 4242 4242 4242 4242
- Validade: qualquer data futura
- CVV: qualquer 3 dígitos
- CEP: qualquer CEP válido
```

### Passo 4: Verificar webhook (após pagamento)

```text
1. Faça o pagamento de teste
2. Verifique os logs do stripe-webhook
3. Confirme na tabela company_subscriptions:
   - stripe_customer_id preenchido
   - stripe_subscription_id preenchido
   - status = "active"
4. Confirme na tabela companies:
   - status = "active"
```

### Passo 5: Testar listagem de faturas

```text
1. Acesse como usuário da empresa
2. Vá em Configurações > Meu Plano
3. Verifique se as faturas aparecem corretamente
```

---

## 3. Comandos para Verificar Logs

Após as alterações, você pode usar:
- **Logs do admin-create-stripe-subscription**: verificar criação de assinaturas
- **Logs do stripe-webhook**: verificar recebimento de eventos
- **Tabela company_subscriptions**: verificar IDs salvos

---

## 4. Checklist de Validação

| Item | Status |
|------|--------|
| Price IDs do Basic atualizados | ✅ Concluído |
| Webhook configurado no Stripe | ✅ Verificar |
| STRIPE_WEBHOOK_SECRET configurado | ✅ Verificar |
| payment_provider = "stripe" | ✅ Verificar |
| Teste de criação de assinatura | ⏳ Pendente |
| Teste de pagamento com cartão 4242 | ⏳ Pendente |
| Verificar webhook logs | ⏳ Pendente |
