
## Corrigir erro "Produto inativo" ao gerar cobrança ENTERPRISE

### Causa raiz identificada

Ao clicar em "Gerar Link de Pagamento" no Global Admin, a função `admin-create-stripe-subscription` é chamada. Essa função tem um mapeamento de price IDs diferente do `generate-payment-link`, usando um price ID antigo e inativo para o plano ENTERPRISE:

| Função | ENTERPRISE monthly | ENTERPRISE yearly |
|---|---|---|
| `admin-create-stripe-subscription` | `price_1SwAzXPssGNUXxgnfHklx8Qx` ❌ **INATIVO** | `price_1SwAzuPssGNUXxgn3SbEka4n` ❌ provavelmente inativo |
| `generate-payment-link` | `price_1SxTGxPssGNUXxgnSxQdCPRA` ✅ | `price_1SxTHhPssGNUXxgnYdCD8656` ✅ |

O Stripe retornou explicitamente: *"The product prod_TtyxisfziVJVcJ is marked as inactive, and thus no new subscriptions can be created"*.

### Solução

Atualizar os price IDs na função `admin-create-stripe-subscription` para usar os mesmos IDs ativos que já estão em `generate-payment-link`.

Os price IDs corretos (ativos no Stripe) são:

```
PRIME:        monthly: price_1SxTPmPssGNUXxgnznft9KJf
              yearly:  price_1SxTGcPssGNUXxgnpCeUC2OV
BASIC:        monthly: price_1SwDgnPssGNUXxgnH6kyepNO
              yearly:  price_1SwAujPssGNUXxgnEFJL0T6l
STARTER:      monthly: price_1SwAvUPssGNUXxgnT3lrWG6S
              yearly:  price_1SwAwNPssGNUXxgnnMMSemHz
PROFESSIONAL: monthly: price_1SwAyyPssGNUXxgn8mzTO9gC
              yearly:  price_1SwAyyPssGNUXxgnNEbvcWuw
ENTERPRISE:   monthly: price_1SxTGxPssGNUXxgnSxQdCPRA  ← corrigido
              yearly:  price_1SxTHhPssGNUXxgnYdCD8656   ← corrigido
```

### Detalhe técnico

**Arquivo: `supabase/functions/admin-create-stripe-subscription/index.ts`**

Substituir o bloco `PLAN_PRICES` (linhas 18-35) com os price IDs corretos, unificados com os que já funcionam no `generate-payment-link`. Também adicionar o plano PRIME que estava faltando.

### Impacto

- Corrige imediatamente o erro "Produto inativo" ao gerar cobrança para ENTERPRISE
- Garante consistência entre as duas funções que geram cobranças
- Sem alteração em banco de dados, RLS ou qualquer outra lógica
