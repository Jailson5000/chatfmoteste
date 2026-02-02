

# Plano: Mensagem Amigável + Visualização de Status de Pagamento

## Resumo

Duas melhorias:
1. Tornar a mensagem de suspensão mais amigável e direta
2. Adicionar coluna de status de pagamento na lista de empresas do Global Admin

---

## 1. Mensagem de Suspensão Mais Amigável

### Antes vs Depois

| Antes | Depois |
|-------|--------|
| "Acesso Suspenso Temporariamente" | "Conta Suspensa" |
| "Identificamos uma pendência financeira na sua conta" | "Para continuar usando, regularize seu pagamento" |
| Texto longo explicativo | Direto ao ponto |

### Mudanças em `CompanySuspended.tsx`

**Título:**
```
Conta Suspensa
```

**Subtítulo:**
```
Para voltar a usar o sistema, regularize seu pagamento clicando no botão abaixo.
```

**Caixa de motivo (se houver):**
- Manter, mas com texto mais neutro

**Seção de ajuda:**
- Simplificar para mensagem curta: "Dúvidas? Fale com nosso suporte."

---

## 2. Status de Pagamento na Lista de Empresas

### Dados Disponíveis

Tabela `company_subscriptions`:
- `stripe_subscription_id` - ID da assinatura Stripe
- `current_period_start` - Início do período atual
- `current_period_end` - Fim do período atual (vencimento)
- `last_payment_at` - Último pagamento
- `next_payment_at` - Próximo pagamento
- `status` - Status da assinatura

### Lógica de Status

```text
┌─────────────────────────────────────────────────────────────────────┐
│  Sem subscription      → Badge cinza: "Sem assinatura"             │
│  status = 'active'     → Badge verde: "Em dia" + próx. venc.        │
│  status = 'trialing'   → Badge azul: "Trial"                        │
│  status = 'past_due'   → Badge vermelho: "Vencido" + dias atraso    │
│  status = 'canceled'   → Badge outline: "Cancelada"                 │
│  status = 'unpaid'     → Badge vermelho: "Inadimplente"             │
└─────────────────────────────────────────────────────────────────────┘
```

### Mudanças Necessárias

**1. Hook `useCompanies.tsx`:**
- Adicionar join com `company_subscriptions` para trazer dados de billing

```typescript
interface Company {
  // ... campos existentes ...
  subscription?: {
    id: string;
    stripe_subscription_id: string | null;
    status: string | null;
    current_period_end: string | null;
    last_payment_at: string | null;
  } | null;
}

// Na query:
.select(`
  *,
  plan:plans!companies_plan_id_fkey(...),
  law_firm:law_firms(...),
  subscription:company_subscriptions(id, stripe_subscription_id, status, current_period_end, last_payment_at)
`)
```

**2. Página `GlobalAdminCompanies.tsx`:**
- Adicionar coluna "Faturamento" na tabela de empresas aprovadas
- Mostrar badge colorido com status
- Tooltip com detalhes (último pagamento, próximo vencimento)

### Visualização na Tabela

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Empresa     │ Plano   │ Status │ Faturamento        │ Criada em   │
├─────────────────────────────────────────────────────────────────────┤
│ MiauChat    │ Starter │ Ativa  │ ✅ Em dia (15/02)   │ 01/01/2026  │
│ Empresa X   │ Basic   │ Trial  │ 🔵 Trial            │ 28/01/2026  │
│ Empresa Y   │ Pro     │ Ativa  │ ⚠️ Vencido (3 dias) │ 15/12/2025  │
│ Demo Corp   │ Basic   │ Susp.  │ ❌ Inadimplente     │ 10/01/2026  │
└─────────────────────────────────────────────────────────────────────┘
```

### Tooltip de Detalhes

Ao passar o mouse na coluna "Faturamento":
```text
┌─────────────────────────────┐
│ Assinatura Stripe           │
│ ─────────────────────────── │
│ Status: Ativa               │
│ Último pgto: 08/01/2026     │
│ Próx. venc: 08/02/2026      │
│ Valor: R$ 497,00/mês        │
│                             │
│ [Ver no Stripe ↗]           │
└─────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Descrição |
|---------|-----------|
| `src/pages/CompanySuspended.tsx` | Mensagem mais amigável e direta |
| `src/hooks/useCompanies.tsx` | Adicionar join com company_subscriptions |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Adicionar coluna de faturamento |

---

## Risco de Quebrar o Sistema

**Mínimo:**

1. **CompanySuspended**: Apenas mudança de texto/UI - sem impacto funcional
2. **useCompanies**: Adicionar campo opcional - empresas sem subscription continuam funcionando
3. **GlobalAdminCompanies**: Adicionar coluna - colunas existentes não são afetadas

---

## Fluxo de Verificação

```text
1. Admin abre Global Admin > Empresas
   ↓
2. Vê lista com nova coluna "Faturamento"
   ↓
3. Identifica visualmente quem está em dia, vencido, etc.
   ↓
4. Clica [...] > "Suspender" em empresa inadimplente
   ↓
5. Cliente vê tela amigável: "Conta Suspensa - Regularize aqui"
   ↓
6. Cliente clica "Pagar Agora" → vai pro Stripe
   ↓
7. Admin libera empresa após confirmação do pagamento
```

---

## Validações Pós-Implementação

- [ ] Página de suspensão mostra mensagem amigável
- [ ] Coluna de faturamento aparece na lista de empresas
- [ ] Empresas sem assinatura mostram "Sem assinatura"
- [ ] Empresas em dia mostram badge verde com data
- [ ] Empresas vencidas mostram badge vermelho
- [ ] Tooltip mostra detalhes do pagamento
- [ ] Nenhuma quebra nas funcionalidades existentes

