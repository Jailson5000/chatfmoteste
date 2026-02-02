

# Plano: Correção da Chave Stripe Inválida

## Problema Identificado

O log mostra o erro:
```
Invalid API Key provided: mk_1Sn4E***************0aDP
```

**Causa:** O `STRIPE_SECRET_KEY` foi configurado com um valor inválido. A chave inserida começa com `mk_1Sn4E...`, que **NÃO** é uma Secret Key válida do Stripe.

### Formato correto das chaves:

| Tipo | Formato | Exemplo |
|------|---------|---------|
| Secret Key (Teste) | `sk_test_...` | `sk_test_51SwBhvPuIhszhOCI...` |
| Secret Key (Produção) | `sk_live_...` | `sk_live_51SwBhvPuIhszhOCI...` |
| Webhook Secret | `whsec_...` | `whsec_abc123...` |

O valor `mk_1Sn4E...` parece ser um identificador interno, não uma API Key.

---

## Webhook Status ✅

Seu webhook está configurado corretamente no Stripe Dashboard:
- **URL:** `https://jiragtersejnarxruqyd.supabase.co/functions/v1/stripe-webhook`
- **Eventos:** checkout.session.completed, customer.subscription.deleted, customer.subscription.updated, invoice.paid, invoice.payment_failed

Porém, os logs mostram que **nenhum webhook foi recebido ainda**, o que é esperado já que nenhum checkout foi completado com sucesso.

---

## Solução

### Ação Necessária (Manual):

1. Acessar o **Stripe Dashboard**: https://dashboard.stripe.com/apikeys
2. Copiar a **Secret Key** de produção (ou teste para testar primeiro)
   - Deve começar com `sk_live_` (produção) ou `sk_test_` (teste)
3. Atualizar o secret `STRIPE_SECRET_KEY` com a chave correta

---

## Correções de Código: Nenhuma

O código está correto. O problema é exclusivamente a chave inválida nas variáveis de ambiente.

Os logs confirmam que:
- ✅ Cálculo de preços está correto: `basePlanPrice: 197, additionalUsers: 0, additionalInstances: 0`
- ✅ Cliente Stripe foi encontrado: `cus_Tu0v9rAzPYIVKk`
- ❌ Falha ao criar sessão de checkout: chave inválida

---

## Próximos Passos

1. **Você precisa fornecer a chave correta** → Vou solicitar a atualização do secret
2. Após atualizar, testar o botão "Assinar Agora" novamente
3. Verificar se o webhook recebe os eventos

