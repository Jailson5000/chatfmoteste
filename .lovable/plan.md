
# Plano: Correções no Fluxo de Pagamento e Faturas

## Problemas Identificados

### 1. Página de Fatura só mostra Boleto
**Causa raiz:** A página hospedada de fatura do Stripe (`hosted_invoice_url`) exibe os métodos de pagamento configurados **no dashboard do Stripe**, não via código. Diferente do Checkout Session (que usa `payment_method_types`), as faturas de subscription usam as configurações do portal de billing.

**Solução:** 
- O texto do botão "Pagar com cartão ou boleto" está incorreto para faturas - a disponibilidade depende da configuração no Stripe Dashboard
- Alterar o texto do botão para "Pagar Fatura" (sem especificar método)
- Adicionar uma nota na documentação interna sobre configurar métodos no Stripe Dashboard

### 2. Botão de Download baixa link em vez do PDF
**Causa raiz:** Analisando o código, o `bankSlipUrl` recebe `invoice.invoice_pdf` que é a URL correta do PDF. Preciso verificar se a URL está sendo passada corretamente.

**Solução:** Verificar se o comportamento está correto - o PDF do Stripe já baixa o documento. Se estiver mostrando outra página, pode ser um problema de cache ou o PDF ainda não gerado.

### 3. Sem opção de cupom para assinaturas existentes
**Causa raiz:** 
- Para novas assinaturas → Checkout Session com `allow_promotion_codes: true` ✅ (já implementado)
- Para assinaturas existentes → O cupom precisa ser aplicado via **Customer Portal** ou via API administrativa

**Solução:** Criar/usar o Customer Portal do Stripe que já permite aplicar cupons em assinaturas existentes.

---

## Mudanças Propostas

### Alteração 1: Simplificar texto do botão de pagamento de faturas

**Arquivo:** `src/components/settings/MyPlanSettings.tsx`

```tsx
// Linha 768 - Remover menção a métodos específicos
<Button 
  variant="default" 
  size="sm"
  className="h-8 gap-1.5 text-xs"
  onClick={() => window.open(invoice.invoiceUrl!, "_blank")}
  title="Pagar fatura online"
>
  <CreditCard className="h-3.5 w-3.5" />
  Pagar
</Button>
```

### Alteração 2: Criar função de Customer Portal

**Arquivo:** `supabase/functions/customer-portal/index.ts`

Criar edge function que abre o Stripe Customer Portal, onde o cliente pode:
- Gerenciar métodos de pagamento
- Ver e pagar faturas
- Aplicar cupons em assinaturas existentes
- Cancelar ou alterar plano

```typescript
// Pseudocódigo
const portalSession = await stripe.billingPortal.sessions.create({
  customer: customerId,
  return_url: `${origin}/settings?tab=meu-plano`,
});
return { url: portalSession.url };
```

### Alteração 3: Adicionar botão "Gerenciar Assinatura" no frontend

**Arquivo:** `src/components/settings/MyPlanSettings.tsx`

Adicionar botão que leva ao Customer Portal do Stripe para:
- Clientes ativos gerenciarem sua assinatura
- Aplicar cupons
- Atualizar método de pagamento

```tsx
<Button 
  variant="outline" 
  size="sm" 
  onClick={handleOpenCustomerPortal}
  disabled={isPortalLoading || !hasActiveSubscription}
>
  <Settings className="h-4 w-4" />
  Gerenciar Assinatura
</Button>
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/settings/MyPlanSettings.tsx` | Atualizar texto dos botões + adicionar botão Customer Portal |
| `supabase/functions/customer-portal/index.ts` | **NOVO** - Edge function para abrir portal |

---

## Fluxo Corrigido

```text
CENÁRIO 1: Cliente quer pagar fatura pendente
1. Clica em "Ver Faturas"
2. Clica em "Pagar" na fatura pendente
3. Abre página do Stripe com opções configuradas no dashboard

CENÁRIO 2: Cliente ativo quer usar cupom
1. Clica em "Gerenciar Assinatura" (NOVO)
2. Abre Stripe Customer Portal
3. Aplica cupom na assinatura existente
4. Retorna ao sistema

CENÁRIO 3: Cliente quer baixar fatura
1. Clica em ícone de download
2. Baixa PDF direto (já funciona)
```

---

## Configuração Necessária no Stripe Dashboard

Para habilitar cartão nas faturas, o administrador deve:

1. Acessar: **Stripe Dashboard → Settings → Billing → Invoice**
2. Em "Payment methods", habilitar:
   - Card
   - Boleto
3. Em "Customer Portal", habilitar:
   - Allow customers to apply promotion codes

---

## Considerações

1. **Sem quebra de funcionalidade**: Apenas adiciona opções, não remove nada
2. **Cupons funcionam via Portal**: O Customer Portal já suporta aplicação de cupons
3. **Métodos de pagamento**: Dependem de configuração no dashboard, não no código
4. **Compatibilidade**: O botão de portal só aparece para clientes com assinatura ativa

---

## Resumo das Mudanças de Código

| Tipo | Descrição |
|------|-----------|
| Frontend | Atualizar texto do botão "Pagar" removendo menção a métodos |
| Frontend | Adicionar botão "Gerenciar Assinatura" |
| Edge Function | Criar `customer-portal` para abrir Stripe Portal |
| Documentação | Instruções sobre configurar métodos no Stripe Dashboard |
