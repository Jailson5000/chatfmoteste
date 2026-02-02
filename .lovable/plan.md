
# Plano: Correções Finais para Fluxo de Pagamento Stripe

## Diagnóstico Atual

### Sobre as Chaves (Confirmado)
**Sim, são duas chaves diferentes e AMBAS estão configuradas:**

| Chave | Formato | Uso | Status |
|-------|---------|-----|--------|
| `STRIPE_SECRET_KEY` | `sk_test_...` / `sk_live_...` | Criar clientes, checkouts, assinaturas | ✅ Configurado |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Validar assinatura dos webhooks | ✅ Configurado |

### Constraint do Banco (Atualizada)
A constraint `billing_type_check` já foi atualizada e aceita: `'monthly', 'yearly', 'stripe', 'asaas', 'trialing'` ✅

---

## Problema Encontrado: Coluna Faltando

O arquivo `stripe-webhook/index.ts` tenta usar uma coluna que **não existe**:

```typescript
// Linha 297-300 - Quando assinatura é cancelada
.update({ 
  status: "cancelled",
  cancelled_at: new Date().toISOString(),  // ❌ COLUNA NÃO EXISTE
  updated_at: new Date().toISOString()
})
```

Quando o Stripe envia um evento `customer.subscription.deleted`, o webhook falha porque tenta atualizar uma coluna inexistente.

---

## Correções Necessárias

### 1. Adicionar Coluna `cancelled_at`

Migração SQL:
```sql
ALTER TABLE company_subscriptions 
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
```

### 2. Verificar se há outros campos faltando

Analisando o webhook, ele também pode usar:
- `last_payment_at` → ✅ Existe
- `status` → ✅ Existe
- `updated_at` → ✅ Existe

---

## Resumo das Alterações

| Arquivo | Mudança |
|---------|---------|
| Migração SQL | Adicionar coluna `cancelled_at` |

---

## Por que o erro "non-2xx" ao clicar em pagar?

O erro anterior era causado pela constraint `billing_type_check` que já foi corrigida. 

**Para testar agora:**
1. Deletar o usuário órfão `miautest03@gmail.com` via `purge-user-by-email`
2. Deletar o law_firm órfão via SQL ou nova função `delete-company-full`
3. Criar um novo trial com email limpo
4. Tentar assinar

Se ainda houver erro, precisamos ver os logs específicos da função `generate-payment-link` ou `register-company`.
