
# Plano de Correção: Pagamento Direto e Planos

## Diagnóstico

Identifiquei **dois problemas** que impedem o pagamento direto:

### Problema 1: Provider de Pagamento Incorreto
A página de registro está chamando `create-asaas-checkout` diretamente, mas o sistema está configurado para usar **Stripe** (`payment_provider: stripe`). A API do ASAAS está retornando respostas vazias, causando erro "Unexpected end of JSON input".

### Problema 2: Price IDs Desatualizados
A função `create-checkout-session` (Stripe) ainda usa Price IDs do ambiente de **teste**, que não existem no ambiente de **produção**.

| Plano | ID Atual (Teste - Inválido) | ID Correto (Produção) |
|-------|---------------------------|----------------------|
| Basic Mensal | `price_1SwBhvPuIhszhOCI...` | `price_1SwDgnPssGNUXxgnH6kyepNO` |
| Basic Anual | `price_1SwBiAPuIhszhOCI...` | `price_1SwAujPssGNUXxgnEFJL0T6l` |
| Starter Mensal | `price_1Sn4HqPuIhszhOCI...` | `price_1SwAvUPssGNUXxgnT3lrWG6S` |
| Starter Anual | `price_1Sn4K7PuIhszhOCI...` | `price_1SwAwNPssGNUXxgnnMMSemHz` |
| Professional Mensal | `price_1Sn4I3PuIhszhOCI...` | `price_1SwAyyPssGNUXxgn8mzTO9gC` |
| Professional Anual | `price_1Sn4KcPuIhszhOCI...` | `price_1SwAyyPssGNUXxgnNEbvcWuw` |
| Enterprise Mensal | `price_1Sn4IJPuIhszhOCI...` | `price_1SwAzXPssGNUXxgnfHklx8Qx` |
| Enterprise Anual | `price_1Sn4KnPuIhszhOCI...` | `price_1SwAzuPssGNUXxgn3SbEka4n` |

---

## Solução

### Correção 1: Atualizar Página de Registro
Modificar `src/pages/Register.tsx` para:
- Consultar o `payment_provider` configurado em `system_settings`
- Usar `create-checkout-session` (Stripe) quando provider = "stripe"
- Manter `create-asaas-checkout` como fallback

### Correção 2: Atualizar Price IDs do Stripe
Modificar `supabase/functions/create-checkout-session/index.ts`:
- Substituir todos os Price IDs de teste pelos IDs de produção corretos
- Alinhar com os IDs já corrigidos em `admin-create-stripe-subscription`

---

## Arquivos a Modificar

1. **`src/pages/Register.tsx`** - Linha ~190
   - Adicionar lógica para consultar `system_settings` e determinar o provider
   - Chamar a função correta com base no provider

2. **`supabase/functions/create-checkout-session/index.ts`** - Linhas 11-27
   - Atualizar o objeto `PLAN_PRICES` com os IDs de produção corretos

---

## Resultado Esperado

Após as correções:
- "Pagar Agora" redirecionará para o checkout do **Stripe** (provider ativo)
- Os Price IDs corretos serão utilizados
- O fluxo de pagamento direto funcionará para todos os planos

---

## Detalhes Técnicos

```text
┌─────────────────┐     ┌───────────────────────┐     ┌──────────────┐
│  Register.tsx   │────▶│ Query system_settings │────▶│ provider=?   │
└─────────────────┘     └───────────────────────┘     └──────────────┘
                                                             │
                    ┌────────────────────────────────────────┼────────────────────┐
                    │                                        │                    │
                    ▼                                        ▼                    ▼
        ┌───────────────────────┐              ┌─────────────────────┐    ┌──────────────┐
        │ create-checkout-      │              │ create-asaas-       │    │ Erro:        │
        │ session (Stripe)      │              │ checkout (ASAAS)    │    │ Provedor     │
        │ com Price IDs corretos│              │                     │    │ desconhecido │
        └───────────────────────┘              └─────────────────────┘    └──────────────┘
```
