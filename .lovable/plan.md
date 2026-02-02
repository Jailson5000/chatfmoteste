
# Plano: Correção Completa do Fluxo de Pagamento Stripe

## Diagnóstico dos 3 Problemas

### Problema 1: Erro "No such customer" ao Assinar
**Log encontrado:**
```
No such customer: 'cus_Tu0v9rAzPYIVKk'
Using existing Stripe customer: cus_Tu0v9rAzPYIVKk
```

**Causa Raiz**: O `stripe_customer_id` salvo no banco foi criado no **ambiente de TESTE** do Stripe. Quando você trocou para a chave de **PRODUÇÃO**, esse ID não existe mais no Stripe Live.

**Dados no banco (exemplo):**
| Empresa | stripe_customer_id | Criado em |
|---------|-------------------|-----------|
| Miau test | cus_Tu0v9rAzPYIVKk | Teste ❌ |
| Suporte MiauChat | cus_TtzgYrnbQ5fSYj | Teste ❌ |
| FMO Advogados | cus_TtzlYvo7KEtYwo | Teste ❌ |

### Problema 2: Faturas não aparecem
**Log encontrado:**
```
Subscription lookup - stripeCustomerId: cus_TtzgYrnbQ5fSYj
ERROR - No such customer: 'cus_TtzgYrnbQ5fSYj'
```

**Causa**: Mesmo problema - `list-stripe-invoices` tenta buscar faturas de um cliente que não existe no ambiente de produção.

### Problema 3: Webhook
**Teste realizado:**
```
POST /stripe-webhook → 400 "Missing stripe-signature header"
```

**Status**: ✅ Webhook está funcionando corretamente! O erro 400 é esperado porque a requisição de teste não tinha assinatura Stripe válida.

---

## Solução: Validar e Recriar Clientes Stripe

A correção precisa:
1. Antes de usar um `stripe_customer_id`, verificar se ele existe no Stripe atual
2. Se não existir, criar um novo cliente e atualizar o banco
3. Aplicar essa lógica em TODAS as funções que usam `stripe_customer_id`

---

## Alterações Técnicas

### 1. `generate-payment-link/index.ts`
Adicionar validação do cliente antes de usar:

```typescript
// ANTES (problemático):
if (subscription?.stripe_customer_id) {
  customerId = subscription.stripe_customer_id;
}

// DEPOIS (com validação):
if (subscription?.stripe_customer_id) {
  try {
    await stripe.customers.retrieve(subscription.stripe_customer_id);
    customerId = subscription.stripe_customer_id;
  } catch (e) {
    // Cliente não existe no Stripe atual (mudou de test para live)
    console.log("Customer not found in Stripe, will search/create new one");
    customerId = undefined;
    
    // Limpar o ID inválido do banco
    await supabase
      .from("company_subscriptions")
      .update({ stripe_customer_id: null, stripe_subscription_id: null })
      .eq("company_id", company.id);
  }
}

// Se não tem cliente válido, buscar por email ou criar novo
if (!customerId) {
  const customers = await stripe.customers.list({ email: company.email, limit: 1 });
  if (customers.data.length > 0) {
    customerId = customers.data[0].id;
  }
  // Se ainda não tem, será criado automaticamente pelo Checkout Session
}
```

### 2. `list-stripe-invoices/index.ts`
Mesma validação para não falhar ao listar faturas:

```typescript
// Validar se o cliente existe antes de buscar faturas
if (stripeCustomerId) {
  try {
    await stripe.customers.retrieve(stripeCustomerId);
  } catch (e) {
    // Cliente não existe - limpar e retornar lista vazia
    await supabase
      .from("company_subscriptions")
      .update({ stripe_customer_id: null, stripe_subscription_id: null })
      .eq("company_id", company.id);
    
    return new Response(
      JSON.stringify({ invoices: [], message: "Histórico será criado após primeiro pagamento" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
```

### 3. Migração SQL: Limpar IDs inválidos
Limpar todos os IDs de teste do banco para começar do zero:

```sql
-- Limpar IDs de clientes/assinaturas de teste
UPDATE company_subscriptions 
SET 
  stripe_customer_id = NULL,
  stripe_subscription_id = NULL,
  status = 'pending'
WHERE stripe_customer_id IS NOT NULL;
```

---

## Fluxo Corrigido

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ FLUXO: Cliente clica "Assinar Agora"                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Frontend chama generate-payment-link                                     │
│ 2. Busca company_subscriptions.stripe_customer_id                          │
│ 3. SE tem ID → Valida no Stripe API                                        │
│    ├─ SE existe → usa esse ID                                              │
│    └─ SE não existe → limpa banco, busca por email ou deixa NULL          │
│ 4. Cria Checkout Session (Stripe cria customer se necessário)             │
│ 5. Retorna URL → Frontend redireciona                                      │
│ 6. Cliente paga → Webhook recebe evento                                   │
│ 7. Webhook atualiza company_subscriptions com novo customer_id válido     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| Migração SQL | Limpar todos IDs de teste |
| `generate-payment-link` | Validar customer antes de usar |
| `list-stripe-invoices` | Validar customer antes de listar |
| Deploy | Redeployar ambas funções |

---

## Por que isso aconteceu?

1. Sistema foi desenvolvido usando chave de **TESTE** (`sk_test_...`)
2. Clientes foram criados no ambiente de teste do Stripe
3. Quando trocou para **PRODUÇÃO** (`sk_live_...`), os clientes de teste não existem
4. O código não validava se o cliente ainda existe antes de usar

Essa correção torna o sistema resiliente a mudanças de ambiente e auto-corrige IDs inválidos.
