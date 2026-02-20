
## Correção: "Unexpected date format: undefined" na sincronização Stripe

### Causa raiz

A API do Stripe na versão `2025-03-31.basil` (e posteriores, incluindo a `2025-08-27.basil` usada no projeto) **removeu** os campos `current_period_start` e `current_period_end` do objeto de assinatura (`subscription`).

Esses campos agora ficam no nível de **item da assinatura**: `subscription.items.data[0].current_period_start` e `subscription.items.data[0].current_period_end`.

Por isso `stripeSub.current_period_start` retorna `undefined`, e a função `toISODate(undefined)` lança "Unexpected date format: undefined".

Fonte oficial: [Stripe Changelog - Deprecate subscription current period](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end)

### Solução

**Arquivo: `supabase/functions/sync-stripe-subscriptions/index.ts`**

Alterar a leitura dos campos de período para buscar do primeiro item da assinatura:

```text
// ANTES (quebrado):
stripeSub.current_period_start
stripeSub.current_period_end

// DEPOIS (correto):
stripeSub.items.data[0].current_period_start
stripeSub.items.data[0].current_period_end
```

Adicionar validacao de seguranca caso `items.data` esteja vazio.

### Impacto

- Apenas 2 linhas alteradas no edge function
- Sem alteracao em banco, RLS, ou frontend
- Apos o deploy, clicar "Sincronizar Stripe" vai funcionar e preencher as datas de vencimento
