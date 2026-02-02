
# Plano de Migração Completa: ASAAS → Stripe

## Visão Geral

Este plano detalha a substituição completa de todas as referências ao ASAAS pelo Stripe, tornando o Stripe a única plataforma de pagamentos do sistema.

---

## Arquivos a Modificar

### 1. Frontend - Área do Cliente

| Arquivo | Modificação |
|---------|-------------|
| `src/components/settings/MyPlanSettings.tsx` | Trocar `list-asaas-invoices` por `list-stripe-invoices` |

**Detalhes técnicos:**
- Linha 67-71: Alterar `queryKey` e `queryFn` para usar `list-stripe-invoices`
- O formato de resposta é compatível (já mapeamos no Stripe)

---

### 2. Frontend - Admin Global

| Arquivo | Modificação |
|---------|-------------|
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Múltiplas alterações (veja abaixo) |

**Alterações necessárias:**
1. **Linha 183**: Trocar `admin-create-asaas-subscription` por `admin-create-stripe-subscription`
2. **Linha 214**: Alterar mensagem de toast removendo referência "ASAAS"
3. **Linha 348**: Alterar comentário "ASAAS sync" para "Stripe sync"
4. **Linha 378**: Trocar `update-asaas-subscription` por `update-stripe-subscription`
5. **Linhas 386-401**: Alterar mensagens de erro/sucesso removendo "ASAAS"
6. **Linha 1451**: Alterar texto "Gerar Cobrança ASAAS" para "Gerar Cobrança Stripe"
7. **Linhas 1757-1763**: Alterar título do dialog para "Gerar Cobrança Stripe"

---

### 3. Edge Functions - Criar Nova

| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/admin-create-stripe-subscription/index.ts` | **NOVA** - Equivalente Stripe do `admin-create-asaas-subscription` |

**Funcionalidade:**
- Admin global pode criar assinaturas para empresas existentes
- Usa Stripe Customer Portal ou Invoice API
- Calcula preço com adicionais (usuários/instâncias extras)
- Registra `stripe_customer_id` e `stripe_subscription_id`

---

### 4. Edge Functions - Atualizar

| Arquivo | Modificação |
|---------|-------------|
| `supabase/functions/generate-payment-link/index.ts` | Substituir ASAAS por Stripe |
| `supabase/functions/get-billing-status/index.ts` | Substituir ASAAS por Stripe (faturas do admin) |

**generate-payment-link (Stripe):**
```text
┌─────────────────────────────────────────────────────┐
│ FLUXO: Gerar link de pagamento (Trial → Assinante) │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────┐
│ 1. Buscar empresa     │
│    (company + plan)   │
└───────────────────────┘
         │
         ▼
┌───────────────────────┐
│ 2. Buscar/criar       │
│    Stripe Customer    │
└───────────────────────┘
         │
         ▼
┌───────────────────────┐
│ 3. Calcular preço     │
│    base + adicionais  │
└───────────────────────┘
         │
         ▼
┌───────────────────────┐
│ 4. Criar Checkout     │
│    Session (Stripe)   │
└───────────────────────┘
         │
         ▼
┌───────────────────────┐
│ 5. Retornar URL       │
└───────────────────────┘
```

**get-billing-status (Stripe):**
- Usar Stripe API para listar invoices com status `open`, `past_due`
- Manter mesmo formato de resposta para compatibilidade

---

### 5. Edge Functions - Manter (já funcionam com Stripe ou não são afetadas)

| Arquivo | Status |
|---------|--------|
| `stripe-webhook` | ✅ Já criado |
| `list-stripe-invoices` | ✅ Já criado |
| `update-stripe-subscription` | ✅ Já criado |
| `create-checkout-session` | ✅ Já funciona com Stripe |
| `verify-payment` | ✅ Atualizado para Stripe |

---

### 6. Edge Functions - Deprecar (não deletar ainda)

| Arquivo | Status |
|---------|--------|
| `admin-create-asaas-subscription` | 🟡 Deprecar (manter para histórico) |
| `create-asaas-checkout` | 🟡 Deprecar |
| `list-asaas-invoices` | 🟡 Deprecar |
| `update-asaas-subscription` | 🟡 Deprecar |
| `asaas-webhook` | 🟡 Deprecar |

> **Nota:** Não deletamos imediatamente para não quebrar empresas com assinaturas ASAAS ativas. Os webhooks do ASAAS continuarão funcionando para assinaturas legadas.

---

## Detalhes Técnicos

### Nova Edge Function: admin-create-stripe-subscription

```text
┌─────────────────────────────────────────────────────────────┐
│              ADMIN CREATE STRIPE SUBSCRIPTION               │
└─────────────────────────────────────────────────────────────┘
                              │
    ┌─────────────────────────┼─────────────────────────────┐
    │                         │                             │
    ▼                         ▼                             ▼
┌─────────┐            ┌─────────────┐            ┌─────────────┐
│ Auth    │            │ Get Company │            │ Get Plan    │
│ Admin?  │            │ + Plan Data │            │ Price ID    │
└─────────┘            └─────────────┘            └─────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Check existing  │
                    │ Stripe customer │
                    └─────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼ (não existe)      ▼ (existe)          
    ┌───────────┐      ┌─────────────┐          
    │ Create    │      │ Use         │          
    │ customer  │      │ existing    │          
    └───────────┘      └─────────────┘          
                              │
                              ▼
                    ┌─────────────────┐
                    │ Create Invoice  │
                    │ + Invoice Item  │
                    │ for first month │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Finalize & Send │
                    │ Invoice         │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Update DB:      │
                    │ company_subs    │
                    │ stripe_* cols   │
                    └─────────────────┘
```

### Price IDs do Stripe (mapeamento)

```typescript
const PLAN_PRICES = {
  basic: {
    monthly: "price_CRIAR_NO_STRIPE", // ⚠️ Admin deve criar
    yearly: "price_CRIAR_NO_STRIPE"
  },
  starter: {
    monthly: "price_1Sn4HqPuIhszhOCIJeKQV8Zw", // ✅ OK
    yearly: "price_1Sn4K7PuIhszhOCItPywPXua"   // ✅ OK
  },
  professional: {
    monthly: "price_1Sn4I3PuIhszhOCIkzaV5obi", // ✅ OK
    yearly: "price_1Sn4KcPuIhszhOCIe4PRabMr"   // ✅ OK
  },
  enterprise: {
    monthly: "price_1Sn4IJPuIhszhOCIIzHxe05Q", // ✅ OK
    yearly: "price_1Sn4KnPuIhszhOCIGtWyHEST"   // ✅ OK
  }
};
```

---

## Resumo das Alterações

| Tipo | Qtd | Arquivos |
|------|-----|----------|
| **Frontend** | 2 | MyPlanSettings.tsx, GlobalAdminCompanies.tsx |
| **Edge Functions (criar)** | 1 | admin-create-stripe-subscription |
| **Edge Functions (modificar)** | 2 | generate-payment-link, get-billing-status |
| **Edge Functions (deprecar)** | 5 | Funções ASAAS (manter para legado) |

---

## Ações Manuais Necessárias

1. **Criar produto "Basic" no Stripe Dashboard** e atualizar os Price IDs em `create-checkout-session`
2. **Verificar webhook** no painel Stripe (URL + eventos corretos)
3. **Testar fluxo completo** antes de mudar `payment_provider` para "stripe"

---

## Estimativa de Tempo

| Item | Tempo |
|------|-------|
| MyPlanSettings.tsx | 5 min |
| GlobalAdminCompanies.tsx | 15 min |
| admin-create-stripe-subscription | 30 min |
| generate-payment-link (Stripe) | 20 min |
| get-billing-status (Stripe) | 15 min |
| Testes | 20 min |
| **Total** | ~1h45 |
