
# Plano: Remoção Segura do ASAAS

## Resumo

Vou remover **todas** as referências ao ASAAS do projeto para evitar erros, mantendo apenas o Stripe como provedor de pagamento. Farei isso de forma incremental e segura para não quebrar o sistema.

---

## Inventário Completo - O que será removido

### Edge Functions (5 funções a deletar)
| Função | Pasta | Descrição |
|--------|-------|-----------|
| `admin-create-asaas-subscription` | supabase/functions/ | Cria assinatura ASAAS via admin |
| `asaas-webhook` | supabase/functions/ | Recebe webhooks do ASAAS |
| `create-asaas-checkout` | supabase/functions/ | Checkout público ASAAS |
| `list-asaas-invoices` | supabase/functions/ | Lista faturas ASAAS |
| `update-asaas-subscription` | supabase/functions/ | Atualiza valor da assinatura |

### Arquivos Frontend (3 arquivos a modificar)
| Arquivo | Modificação |
|---------|-------------|
| `src/pages/Register.tsx` | Remover fallback para `create-asaas-checkout` |
| `src/components/landing/CheckoutModal.tsx` | Remover fallback para `create-asaas-checkout` |
| `src/hooks/useAddonRequests.tsx` | Remover chamada a `update-asaas-subscription` |

### Configuração (1 arquivo a modificar)
| Arquivo | Modificação |
|---------|-------------|
| `supabase/config.toml` | Remover `[functions.asaas-webhook]` |

### Admin UI (1 arquivo a modificar)
| Arquivo | Modificação |
|---------|-------------|
| `src/pages/global-admin/GlobalAdminSettings.tsx` | Remover opção ASAAS do RadioGroup |

### Edge Function a Modificar (1 arquivo)
| Arquivo | Modificação |
|---------|-------------|
| `supabase/functions/get-payment-metrics/index.ts` | Remover lógica ASAAS, manter apenas Stripe |

---

## O que NÃO será alterado (preservar)

- **Colunas do banco**: `asaas_customer_id` e `asaas_subscription_id` na tabela `company_subscriptions` - manter para histórico
- **Arquivo `types.ts`**: Gerado automaticamente pelo Supabase, não editamos
- **Valor `payment_provider` no banco**: Permanece "stripe", sem alterações no banco
- **`billing_type` constraint**: Mantém suporte a "asaas" para dados históricos

---

## Ordem de Execução (Incremental e Segura)

### Fase 1: Simplificar Frontend
1. **`src/pages/Register.tsx`**
   - Remover consulta de `payment_provider`
   - Chamar diretamente `create-checkout-session` (Stripe)

2. **`src/components/landing/CheckoutModal.tsx`**
   - Remover lógica condicional ASAAS/Stripe
   - Chamar diretamente `create-checkout-session`

3. **`src/hooks/useAddonRequests.tsx`**
   - Remover toda lógica de `update-asaas-subscription`
   - Remover variáveis `asaasUpdated`, `asaasError`, etc.
   - Simplificar toast de sucesso

### Fase 2: Simplificar Admin UI
4. **`src/pages/global-admin/GlobalAdminSettings.tsx`**
   - Remover RadioGroup de seleção de provider
   - Manter apenas exibição de "Stripe está ativo"

### Fase 3: Remover Edge Functions
5. **Deletar as 5 pastas de funções ASAAS**:
   - `supabase/functions/admin-create-asaas-subscription/`
   - `supabase/functions/asaas-webhook/`
   - `supabase/functions/create-asaas-checkout/`
   - `supabase/functions/list-asaas-invoices/`
   - `supabase/functions/update-asaas-subscription/`

6. **Atualizar `supabase/config.toml`**
   - Remover linha `[functions.asaas-webhook]`

### Fase 4: Simplificar Métricas
7. **`supabase/functions/get-payment-metrics/index.ts`**
   - Remover todo bloco de código ASAAS (linhas ~127-220)
   - Remover objeto `asaas` do metrics
   - Manter apenas Stripe

---

## Validação Pós-Implementação

Após as mudanças, o sistema deve:
- ✅ Checkout funcionar via Stripe (Pagar Agora)
- ✅ Trial funcionar normalmente  
- ✅ Aprovação de addons não tentar chamar ASAAS
- ✅ Métricas mostrarem apenas Stripe
- ✅ Nenhuma menção a ASAAS na UI

---

## Arquivos que Serão Modificados

```text
DELETAR:
├── supabase/functions/admin-create-asaas-subscription/index.ts
├── supabase/functions/asaas-webhook/index.ts
├── supabase/functions/create-asaas-checkout/index.ts
├── supabase/functions/list-asaas-invoices/index.ts
└── supabase/functions/update-asaas-subscription/index.ts

MODIFICAR:
├── src/pages/Register.tsx
├── src/components/landing/CheckoutModal.tsx
├── src/hooks/useAddonRequests.tsx
├── src/pages/global-admin/GlobalAdminSettings.tsx
├── supabase/config.toml
└── supabase/functions/get-payment-metrics/index.ts
```

---

## Riscos Mitigados

| Risco | Mitigação |
|-------|-----------|
| Quebrar checkout público | Usar Stripe diretamente (já funciona) |
| Perder histórico de dados | Colunas do banco mantidas |
| Quebrar aprovação de addons | Remover chamada ASAAS, manter lógica de limites |
| Quebrar métricas | Simplificar para apenas Stripe |
