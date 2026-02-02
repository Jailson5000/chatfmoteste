
# Plano: Correção do Fluxo Trial → Stripe e Teste em Modo de Produção

## 📋 Diagnóstico Completo

### 1. Sobre o "Modo Teste"
**Sim, você está em modo de teste.** A prova está na imagem do boleto:
- Aviso: "Este é um boleto de teste"
- A URL da fatura contém `test_` (ex: `invoice.stripe.com/i/acct_1Sn4EdPuIhszhOCI/test_...`)

Quando for para produção, você precisará:
- Usar chaves de API do modo Live (sk_live_...)
- Recriar os Price IDs em modo Live no Dashboard do Stripe

---

### 2. Erro "Edge Function returned a non-2xx status code"

O erro aconteceu durante o fluxo de **Trial** (não de pagamento). O log mostra:

```
[register-company] Admin creation failed: "A user with this email address has already been registered"
```

**Causa:** O usuário tentou registrar um trial com email já existente no sistema.

---

### 3. Problema Principal: Cliente Stripe não é criado no Trial

**Fluxo Atual:**

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ TRIAL (7 dias grátis)                                                    │
│                                                                          │
│  1. Usuário clica "Trial Grátis"                                         │
│  2. register-company cria: law_firm → company → admin_user               │
│  3. ❌ NÃO CRIA CLIENTE NO STRIPE                                        │
│  4. Após 7 dias, trial expira                                            │
│  5. Usuário quer pagar → precisa fazer checkout do zero                  │
│  6. Stripe cria novo cliente → sem histórico/data de cadastro            │
└─────────────────────────────────────────────────────────────────────────┘
```

**Problema:** Quando o trial expira e o usuário quer assinar, o Stripe não sabe que ele já era cliente há 7 dias.

---

## 🔧 Solução Proposta

### Criar Cliente Stripe durante o registro do Trial

**Novo Fluxo:**

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ TRIAL (7 dias grátis) - NOVO FLUXO                                      │
│                                                                          │
│  1. Usuário clica "Trial Grátis"                                         │
│  2. register-company cria: law_firm → company → admin_user               │
│  3. ✅ CRIAR CLIENTE NO STRIPE (com metadata: trial_start_date)          │
│  4. ✅ SALVAR stripe_customer_id no banco                                │
│  5. Após 7 dias, trial expira                                            │
│  6. Usuário quer pagar → checkout usa o MESMO cliente Stripe             │
│  7. Stripe tem todo histórico: data cadastro, trial, etc.                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📝 Alterações Necessárias

### 1. Modificar `register-company` para criar cliente Stripe no trial

```typescript
// Após criar law_firm, company e admin_user, criar cliente Stripe
if (shouldAutoApprove) {
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey) {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      
      // Verificar se já existe cliente com este email
      const existingCustomers = await stripe.customers.list({ 
        email: admin_email, 
        limit: 1 
      });
      
      let stripeCustomerId: string;
      
      if (existingCustomers.data.length > 0) {
        stripeCustomerId = existingCustomers.data[0].id;
        console.log(`[register-company] Found existing Stripe customer: ${stripeCustomerId}`);
      } else {
        // Criar novo cliente Stripe
        const customer = await stripe.customers.create({
          email: admin_email,
          name: company_name,
          phone: phone || undefined,
          metadata: {
            company_id: company.id,
            law_firm_id: lawFirm.id,
            trial_started_at: new Date().toISOString(),
            trial_ends_at: trialEndsAt,
            source: "self_service_trial",
          },
        });
        stripeCustomerId = customer.id;
        console.log(`[register-company] Created Stripe customer: ${stripeCustomerId}`);
      }
      
      // Salvar stripe_customer_id na tabela company_subscriptions
      await supabase.from('company_subscriptions').upsert({
        company_id: company.id,
        stripe_customer_id: stripeCustomerId,
        status: 'trialing',
        current_period_start: new Date().toISOString(),
        current_period_end: trialEndsAt,
        billing_type: 'stripe',
      }, { onConflict: 'company_id' });
      
    }
  } catch (stripeError) {
    console.error('[register-company] Error creating Stripe customer:', stripeError);
    // Não falhar o registro - apenas logar o erro
  }
}
```

### 2. Modificar `create-checkout-session` para usar cliente existente

O código atual já faz isso corretamente:
```typescript
// Check if customer already exists
const customers = await stripe.customers.list({ email: adminEmail, limit: 1 });
let customerId: string | undefined;

if (customers.data.length > 0) {
  customerId = customers.data[0].id;
  console.log("[CREATE-CHECKOUT] Found existing customer:", customerId);
}
```

---

## ✅ Benefícios

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Cliente Stripe no trial | ❌ Não criado | ✅ Criado no registro |
| Data de cadastro | Data do pagamento | Data real do trial |
| Histórico no Stripe | Só após 1º pagamento | Desde o trial |
| Conversão trial→pago | Novo cliente | Mesmo cliente |
| Relatórios Stripe | Incompletos | Completos |

---

## 📁 Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/register-company/index.ts` | Adicionar criação de cliente Stripe e upsert em company_subscriptions |

---

## ⚠️ Sobre o Modo de Produção

Para sair do modo teste:
1. No Dashboard Stripe, alterne para **Live Mode**
2. Crie novos Products/Prices em Live Mode
3. Atualize os Price IDs em `create-checkout-session` e `admin-create-stripe-subscription`
4. Configure o webhook apontando para a mesma URL
5. Use a chave `sk_live_...` como secret `STRIPE_SECRET_KEY`

**Recomendação:** Mantenha em modo teste até validar todo o fluxo trial → pagamento.
