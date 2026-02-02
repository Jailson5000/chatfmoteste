
# Plano: Correção Completa do Fluxo de Pagamento Stripe

## Resumo dos 5 Problemas Identificados

| # | Problema | Causa Raiz | Status |
|---|----------|------------|--------|
| 1 | Cliente se cadastrar no Stripe com cobrança para 8º dia | Não implementado | 🔧 Implementar |
| 2 | Plano Basic mostra 5 usuários/2 WA (deveria ser 2/1) | `companies.max_users=5, max_instances=2` hardcoded em algum lugar | 🔧 Corrigir |
| 3 | Checkout mostra como "Área restrita" (teste) | Chave `STRIPE_SECRET_KEY` é de teste (`sk_test_...`) | 🔧 Substituir |
| 4 | Webhooks não recebidos | URL do webhook não configurada no Stripe | 🔧 Configurar |
| 5 | Ativar chave de produção | Precisa de live key | 🔧 Solicitar |

---

## Análise Detalhada

### Problema 1: Trial com Cobrança Automática no 8º Dia

**Situação Atual:**
- O cliente cria trial de 7 dias
- Se quiser assinar, clica em "Assinar Agora" e paga imediatamente
- Não há cobrança automática no fim do trial

**Solução Proposta:**
Criar uma assinatura no Stripe com `trial_period_days: 7` durante o registro. Assim:
- Cliente já fica cadastrado no Stripe com cartão
- Cobrança automática no 8º dia
- Sem ação manual necessária

**Alterações:**
1. Modificar `register-company` para criar uma sessão de checkout com trial
2. Modificar `create-checkout-session` para suportar `subscription_data.trial_period_days`

---

### Problema 2: Limites Errados (5 usuários / 2 WA ao invés de 2/1)

**Dados no Banco:**
```text
Tabela plans (BASIC):
  max_users: 2, max_instances: 1  ✅ CORRETO

Tabela companies (Miau test):
  max_users: 5, max_instances: 2  ❌ ERRADO
  use_custom_limits: false
```

**Causa:**
A tabela `companies` tem valores padrão de colunas (`DEFAULT 5` para max_users e `DEFAULT 2` para max_instances) definidos no schema do banco. 

Quando `register-company` não define explicitamente esses campos, o banco usa os defaults.

**Log mostra o problema:**
```text
basePlanPrice: 197
additionalUsers: 3  ← (5 empresa - 2 plano = 3 adicionais!)
additionalInstances: 1 ← (2 empresa - 1 plano = 1 adicional!)
```

**Solução:**
1. Atualizar `register-company` para definir `max_users` e `max_instances` como `NULL` 
2. Ou alterar os defaults da tabela para `NULL`
3. Ajustar `generate-payment-link` para não calcular adicionais quando `use_custom_limits=false`

---

### Problema 3: Checkout Mostra "Área Restrita"

A URL do checkout é `checkout.stripe.com/c/pay/cs_test_...`

**Causa:** A chave `STRIPE_SECRET_KEY` configurada é de **teste** (`sk_test_...`)

**Solução:** Substituir por chave de **produção** (`sk_live_...`)

---

### Problema 4: Webhooks Não Recebidos

**Logs mostram:** Nenhum evento recebido em `stripe-webhook`

**Causa:** Webhook não configurado no dashboard do Stripe para a URL:
```
https://jiragtersejnarxruqyd.supabase.co/functions/v1/stripe-webhook
```

**Solução:**
1. Acessar Stripe Dashboard → Webhooks
2. Adicionar endpoint: `https://jiragtersejnarxruqyd.supabase.co/functions/v1/stripe-webhook`
3. Selecionar eventos:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copiar o Webhook Signing Secret e atualizar `STRIPE_WEBHOOK_SECRET`

---

### Problema 5: Ativar Chaves de Produção

**Chaves Necessárias:**
1. `STRIPE_SECRET_KEY` → Trocar para `sk_live_...`
2. `STRIPE_WEBHOOK_SECRET` → Nova secret do webhook de produção (`whsec_...`)

---

## Alterações Técnicas

### 1. Migração SQL: Limites Padrão NULL
```sql
-- Alterar defaults para NULL (plano define os limites)
ALTER TABLE companies 
ALTER COLUMN max_users DROP DEFAULT,
ALTER COLUMN max_instances DROP DEFAULT;

-- Limpar dados incorretos das empresas existentes
UPDATE companies 
SET max_users = NULL, max_instances = NULL 
WHERE use_custom_limits = false;
```

### 2. Edge Function: `generate-payment-link`
Corrigir cálculo de adicionais para respeitar `use_custom_limits`:

```typescript
// Antes (ERRADO):
const effectiveLimits = {
  max_users: company.max_users || planLimits.max_users,  // Usa 5 se existir
  max_instances: company.max_instances || planLimits.max_instances,
};

// Depois (CORRETO):
const effectiveLimits = {
  max_users: company.use_custom_limits ? (company.max_users || planLimits.max_users) : planLimits.max_users,
  max_instances: company.use_custom_limits ? (company.max_instances || planLimits.max_instances) : planLimits.max_instances,
};
```

### 3. Edge Function: `create-checkout-session`
Adicionar suporte a trial com cobrança futura:

```typescript
const session = await stripe.checkout.sessions.create({
  // ... existente ...
  subscription_data: {
    trial_period_days: 7,  // Cobrança no 8º dia
    metadata: { ... }
  },
});
```

### 4. Configuração Stripe (Manual)

**No Dashboard Stripe (https://dashboard.stripe.com):**

1. **Webhooks → Add Endpoint:**
   - URL: `https://jiragtersejnarxruqyd.supabase.co/functions/v1/stripe-webhook`
   - Eventos: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.*`

2. **Copiar chaves de produção:**
   - API Keys → Secret key (live): `sk_live_...`
   - Webhooks → Signing secret: `whsec_...`

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| Migração SQL | Defaults NULL + limpar dados |
| `generate-payment-link` | Respeitar `use_custom_limits` |
| `create-checkout-session` | Trial de 7 dias opcional |
| `STRIPE_SECRET_KEY` | Trocar para live key (manual) |
| `STRIPE_WEBHOOK_SECRET` | Atualizar com nova secret (manual) |
| Stripe Dashboard | Configurar webhook endpoint (manual) |

---

## Ações Manuais Necessárias

Após eu implementar as alterações de código, você precisa:

1. **Acessar o Stripe Dashboard** (https://dashboard.stripe.com/apikeys)
2. **Copiar a Secret Key de produção** (`sk_live_...`)
3. **Criar webhook endpoint** com a URL do Supabase
4. **Copiar o Webhook Signing Secret** (`whsec_...`)
5. **Atualizar os secrets** usando a ferramenta que vou disponibilizar

---

## Fluxo Final (Após Correções)

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ FLUXO 1: Trial → Pagamento Automático (NOVO)                             │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Cliente escolhe plano na landing page                                │
│ 2. Preenche dados e clica "Iniciar Trial"                               │
│ 3. Checkout Stripe abre (modo subscription + trial_period_days: 7)      │
│ 4. Cliente cadastra cartão                                              │
│ 5. Trial de 7 dias começa                                               │
│ 6. No 8º dia → Stripe cobra automaticamente                            │
│ 7. Webhook processa `invoice.paid` → ativa assinatura                  │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ FLUXO 2: Trial Existente → Assinar Agora (CORRIGIDO)                    │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Cliente em trial clica "Assinar Agora"                               │
│ 2. generate-payment-link calcula:                                       │
│    - Plano BASIC = R$ 197,00                                            │
│    - Adicionais = R$ 0 (use_custom_limits=false)                       │
│ 3. Total = R$ 197,00                                                    │
│ 4. Checkout Stripe (produção, sem "área restrita")                     │
│ 5. Webhook recebe evento e ativa empresa                               │
└──────────────────────────────────────────────────────────────────────────┘
```
