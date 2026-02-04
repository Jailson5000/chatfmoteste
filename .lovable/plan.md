
# Plano: Adicionar Opções de Pagamento (Cartão, PIX e Boleto) + Cupom de Desconto

## Problema Identificado

Atualmente, ao visualizar faturas pendentes, o usuário só vê a opção de boleto (PDF). A página de checkout do Stripe já suporta múltiplos métodos de pagamento, mas:

1. O botão de pagamento direciona apenas para o PDF do boleto
2. Não há configuração explícita de `payment_method_types` nas Edge Functions
3. Cupons já estão habilitados (`allow_promotion_codes: true`), porém não há indicação visual disso para o usuário

## Análise Técnica

### Arquivos Envolvidos

| Arquivo | Situação Atual | Alteração Necessária |
|---------|----------------|---------------------|
| `supabase/functions/generate-payment-link/index.ts` | Sem `payment_method_types` explícito | Adicionar `payment_method_types: ['card', 'pix', 'boleto']` |
| `supabase/functions/create-checkout-session/index.ts` | Sem `payment_method_types` explícito | Adicionar `payment_method_types: ['card', 'pix', 'boleto']` |
| `src/components/settings/MyPlanSettings.tsx` | Botão genérico para boleto | Adicionar botão "Pagar Agora" que abre página Stripe com todas as opções |

---

## Solução Proposta

### 1. Edge Function: generate-payment-link

Adicionar configuração explícita de métodos de pagamento na criação da sessão de checkout:

```typescript
const session = await stripe.checkout.sessions.create({
  // ... existing config
  payment_method_types: ['card', 'pix', 'boleto'],
  allow_promotion_codes: true, // já existe - cupons funcionam
  // ...
});
```

### 2. Edge Function: create-checkout-session

Mesma alteração para garantir consistência em todos os fluxos de checkout:

```typescript
const session = await stripe.checkout.sessions.create({
  // ... existing config
  payment_method_types: ['card', 'pix', 'boleto'],
  allow_promotion_codes: true, // já existe
  // ...
});
```

### 3. Frontend: MyPlanSettings.tsx - Diálogo de Faturas

**Situação Atual:**
- Botão `FileText` → Nota fiscal
- Botão `ExternalLink` → PDF do boleto

**Nova Estrutura:**
- Botão `FileText` → Nota fiscal (PDF)
- Botão `CreditCard` → **Pagar Agora** (abre página Stripe com cartão/PIX/boleto) - apenas para faturas pendentes

A URL `invoice.invoiceUrl` do Stripe (`hosted_invoice_url`) já direciona para uma página onde o cliente pode escolher entre cartão, PIX ou boleto.

**Código atualizado:**

```tsx
<div className="flex gap-1">
  {/* Botão para pagar - apenas faturas pendentes */}
  {invoice.statusLabel === 'Pendente' && invoice.invoiceUrl && (
    <Button 
      variant="default" 
      size="sm"
      className="h-8 gap-1.5 text-xs"
      onClick={() => window.open(invoice.invoiceUrl!, "_blank")}
      title="Pagar com cartão, PIX ou boleto"
    >
      <CreditCard className="h-3.5 w-3.5" />
      Pagar
    </Button>
  )}
  {/* Botão para baixar PDF da fatura */}
  {invoice.bankSlipUrl && (
    <Button 
      variant="ghost" 
      size="icon" 
      className="h-8 w-8"
      onClick={() => window.open(invoice.bankSlipUrl!, "_blank")}
      title="Baixar PDF"
    >
      <Download className="h-4 w-4" />
    </Button>
  )}
</div>
```

---

## Fluxo do Usuário

```text
1. Usuário clica em "Ver Faturas"
   ↓
2. Diálogo mostra lista de faturas
   ↓
3. Fatura pendente exibe:
   - Valor + Badge "Pendente"
   - Data de vencimento
   - [Botão PAGAR] [Botão PDF]
   ↓
4. Ao clicar em "Pagar":
   - Abre página do Stripe
   - Usuário escolhe: Cartão / PIX / Boleto
   - Campo de cupom disponível automaticamente
   ↓
5. Pagamento processado → Webhook atualiza status
```

---

## Cupons de Desconto

O parâmetro `allow_promotion_codes: true` já está configurado em ambas as Edge Functions. Isso significa:

- Na página de checkout do Stripe, aparece automaticamente um campo "Código promocional"
- Cupons criados no dashboard do Stripe serão aplicados
- Nenhuma mudança adicional necessária

---

## Resumo das Alterações

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `generate-payment-link/index.ts` | Edge Function | Adicionar `payment_method_types` |
| `create-checkout-session/index.ts` | Edge Function | Adicionar `payment_method_types` |
| `MyPlanSettings.tsx` | Frontend | Reorganizar botões no diálogo de faturas |

---

## Benefícios

1. **Flexibilidade**: Cliente escolhe entre cartão, PIX ou boleto
2. **Cupons**: Funcionalidade já ativa, campo visível no checkout
3. **UX Melhorada**: Botão "Pagar" destacado para faturas pendentes
4. **Zero Regressão**: Apenas adiciona opções, não remove funcionalidades existentes

---

## Consideração de Segurança

Nenhuma alteração de RLS ou banco de dados necessária. As mudanças são apenas na camada de apresentação e configuração do Stripe Checkout.
