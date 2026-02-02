

# Plano: Exibir Datas de Trial e Ciclo de Faturamento

## Análise do Cenário

### Situação Atual
1. **Banco de dados** já tem as colunas necessárias: `current_period_start`, `current_period_end`, `next_payment_at`
2. **Webhook do Stripe** não atualiza essas colunas quando há mudança de ciclo
3. **Componente MyPlanSettings** não exibe essas informações
4. **Stripe cuida automaticamente** de gerar faturas a cada 30 dias com base no `billing_cycle_anchor`

### Como o Stripe Funciona
Quando um cliente assina:
- Se trial termina dia 8 de fevereiro → primeira cobrança no dia 8
- Próxima fatura será dia 8 de março (30 dias depois)
- Stripe define o `billing_cycle_anchor` como a data da primeira cobrança
- `subscription.current_period_end` indica quando a próxima fatura será gerada

### Risco de Quebrar o Sistema
**Baixo risco** - As mudanças são:
1. Atualização do webhook (apenas adiciona dados, não altera lógica existente)
2. Exibição na UI (somente leitura, não afeta fluxos de pagamento)

---

## Arquitetura da Solução

```text
┌────────────────────────────────────────────────────────────────────┐
│                          STRIPE                                     │
│  billing_cycle_anchor → determina dia do mês da cobrança           │
│  current_period_end → próxima data de renovação                    │
└───────────────────────────────────┬────────────────────────────────┘
                                    │ webhook events
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│            stripe-webhook Edge Function                            │
│  customer.subscription.updated → atualiza current_period_*         │
│  invoice.paid → atualiza last_payment_at                           │
└───────────────────────────────────┬────────────────────────────────┘
                                    │ UPDATE
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│              company_subscriptions (banco)                         │
│  current_period_start | current_period_end | next_payment_at       │
└───────────────────────────────────┬────────────────────────────────┘
                                    │ SELECT
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│              MyPlanSettings (frontend)                             │
│  Exibe: "Próximo vencimento: 08/03/2026" ou "Trial: 7 dias"        │
└────────────────────────────────────────────────────────────────────┘
```

---

## Mudanças Necessárias

### 1. Webhook do Stripe (Backend)

**Arquivo:** `supabase/functions/stripe-webhook/index.ts`

Modificar os eventos `checkout.session.completed` e `customer.subscription.updated` para salvar as datas do ciclo:

```typescript
// No evento checkout.session.completed:
// Buscar a subscription do Stripe para pegar current_period_*
const subscription = await stripe.subscriptions.retrieve(session.subscription);

await supabase.from("company_subscriptions").upsert({
  // ... dados existentes ...
  current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
  current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  next_payment_at: new Date(subscription.current_period_end * 1000).toISOString(),
});

// No evento customer.subscription.updated:
await supabase.from("company_subscriptions").update({
  current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
  current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  next_payment_at: new Date(subscription.current_period_end * 1000).toISOString(),
});
```

### 2. Query de Billing (Frontend)

**Arquivo:** `src/components/settings/MyPlanSettings.tsx`

Modificar a query de `company-billing` para incluir dados da subscription:

```typescript
const { data: companyData } = useQuery({
  queryKey: ["company-billing", lawFirm?.id],
  queryFn: async () => {
    // ... busca company existente ...
    
    // Adicionar busca de subscription
    const { data: subscription } = await supabase
      .from("company_subscriptions")
      .select("status, current_period_start, current_period_end, next_payment_at")
      .eq("company_id", company.id)
      .maybeSingle();
      
    return { ...company, subscription };
  },
});
```

### 3. Exibição na UI (Frontend)

**Arquivo:** `src/components/settings/MyPlanSettings.tsx`

Adicionar seção visual no card "Resumo Mensal":

| Cenário | Exibição |
|---------|----------|
| **Em Trial** | "⏱️ Trial termina em: 08/02/2026 (5 dias restantes)" |
| **Assinante Ativo** | "📅 Próximo vencimento: 08/03/2026" + "Ciclo de 30 dias (dia 8)" |
| **Trial Expirado** | "⚠️ Trial expirado - Assine para continuar" |

Exemplo de UI no card:

```tsx
{/* Billing Cycle Info */}
{isInTrial ? (
  <div className="flex items-center gap-2 text-amber-600">
    <Clock className="h-4 w-4" />
    <span className="text-sm">Trial termina em {trialEndDate}</span>
  </div>
) : subscription?.next_payment_at && (
  <div className="space-y-1">
    <div className="flex items-center gap-2 text-muted-foreground">
      <Calendar className="h-4 w-4" />
      <span className="text-sm">Próximo vencimento: {nextPaymentDate}</span>
    </div>
    <p className="text-xs text-muted-foreground">
      Ciclo de 30 dias (dia {billingDay} de cada mês)
    </p>
  </div>
)}
```

---

## Exemplo de Fluxo Completo

### Cenário: Cliente inicia trial dia 1 de fevereiro

| Data | Evento | Banco de Dados | UI |
|------|--------|----------------|-----|
| 01/02 | Registro com trial | `trial_ends_at = 08/02` | "Trial: 7 dias restantes" |
| 05/02 | Cliente acessa | - | "Trial: 3 dias restantes" |
| 08/02 | Trial expira | `status = expired` | "Trial expirado" |
| 08/02 | Cliente paga via Stripe | `current_period_end = 08/03`, `status = active` | "Próximo vencimento: 08/03" |
| 08/03 | Stripe cobra automaticamente | `current_period_end = 08/04` | "Próximo vencimento: 08/04" |

### Cenário: Cliente paga direto (sem trial) dia 15/02

| Data | Evento | Banco de Dados | UI |
|------|--------|----------------|-----|
| 15/02 | Pagamento imediato | `current_period_end = 15/03`, `status = active` | "Próximo vencimento: 15/03" |
| 15/03 | Stripe cobra | `current_period_end = 15/04` | "Próximo vencimento: 15/04" |

---

## Arquivos a Modificar

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `supabase/functions/stripe-webhook/index.ts` | Backend | Salvar datas de ciclo nos eventos |
| `src/components/settings/MyPlanSettings.tsx` | Frontend | Query + UI para exibir datas |

---

## Validações Pós-Implementação

- [ ] Webhook atualiza `current_period_end` após pagamento
- [ ] UI mostra data correta do trial enquanto ativo
- [ ] UI mostra data do próximo vencimento após assinatura
- [ ] Nenhum erro ao carregar MyPlanSettings
- [ ] Empresas sem subscription ainda funcionam (graceful handling)

---

## Sobre o Stripe e Datas

O Stripe gerencia automaticamente:
1. **billing_cycle_anchor**: Data âncora (ex: dia 8 do mês)
2. **current_period_start**: Início do ciclo atual
3. **current_period_end**: Fim do ciclo / Próxima cobrança
4. **Faturas automáticas**: Geradas no `current_period_end`

Não precisamos fazer nada extra no Stripe - ele já cuida de tudo. Só precisamos:
- Capturar essas datas via webhook
- Exibi-las na UI

