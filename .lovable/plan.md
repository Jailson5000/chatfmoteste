
# Plano: Correção de Faturas Stripe e Página de Visualização

## 📋 Diagnóstico Completo

### Problema 1: Página quebra ao clicar em "Ver Faturas"
**Causa raiz**: O frontend (`MyPlanSettings.tsx`) espera campos no formato ASAAS (`dueDate`, `paymentDate`, `value`), mas a Edge Function `list-stripe-invoices` retorna campos no formato Stripe (`due_date`, `paid_at`, `amount`).

Quando o código tenta executar:
```typescript
format(new Date(invoice.dueDate), "dd/MM/yyyy", { locale: ptBR })
```
O valor `invoice.dueDate` é `undefined`, resultando em `RangeError: Invalid time value`.

### Problema 2: Assinatura existe no Stripe mas não aparece na UI
**Confirmação**: A assinatura **FOI criada** no Stripe! Encontrei 2 faturas em aberto:
- `in_1SwC5RPuIhszhOCI...` - R$ 197,00 (status: open)
- `in_1SwBliPuIhszhOCI...` - R$ 197,00 (status: open)

O cliente `cus_TtzgYrnbQ5fSYj` existe e tem faturas. O problema é apenas o mapeamento de campos.

### Problema 3: Próximo vencimento mostra "null"
A assinatura está com status `incomplete` porque aguarda pagamento. O campo `current_period_end` só é definido corretamente após o primeiro pagamento.

---

## 🔧 Solução

### Correção: Atualizar mapeamento de campos na Edge Function

**Arquivo**: `supabase/functions/list-stripe-invoices/index.ts`

O formato atual retorna snake_case e campos diferentes. Precisamos mapear para o formato que o frontend espera:

| Atual (Stripe) | Novo (compatível ASAAS) |
|----------------|-------------------------|
| `amount` | `value` |
| `due_date` | `dueDate` |
| `paid_at` | `paymentDate` |
| `invoice_url` | `invoiceUrl` |
| `pdf_url` | `bankSlipUrl` (reutilizando para PDF) |
| *(derivado)* | `statusLabel` |
| *(derivado)* | `statusColor` |
| *(derivado)* | `description` |
| `"stripe"` | `billingType` |

Código atualizado:
```typescript
const formattedInvoices = invoices.data.map((invoice) => {
  // Map Stripe status to label and color
  const statusMap: Record<string, { label: string; color: string }> = {
    draft: { label: "Rascunho", color: "gray" },
    open: { label: "Pendente", color: "yellow" },
    paid: { label: "Pago", color: "green" },
    void: { label: "Cancelado", color: "gray" },
    uncollectible: { label: "Inadimplente", color: "red" },
  };
  
  const statusInfo = statusMap[invoice.status || "open"] || { label: "Pendente", color: "yellow" };
  
  return {
    id: invoice.id,
    value: invoice.amount_due / 100,
    statusLabel: statusInfo.label,
    statusColor: statusInfo.color,
    description: `Assinatura - ${invoice.number || invoice.id}`,
    dueDate: invoice.due_date 
      ? new Date(invoice.due_date * 1000).toISOString() 
      : new Date(invoice.created * 1000).toISOString(), // Fallback to created date
    paymentDate: invoice.status_transitions?.paid_at 
      ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() 
      : null,
    invoiceUrl: invoice.hosted_invoice_url,
    bankSlipUrl: invoice.invoice_pdf, // PDF do Stripe
    billingType: "Stripe",
  };
});
```

---

## ✅ Resultado Esperado

Após a correção:
1. A página de faturas não vai mais quebrar
2. As 2 faturas pendentes (R$ 197,00 cada) vão aparecer na lista
3. O cliente poderá clicar no link para pagar diretamente no Stripe
4. Status será mostrado corretamente como "Pendente" (amarelo)

---

## 📁 Arquivo a Modificar

| Arquivo | Tipo de Mudança |
|---------|-----------------|
| `supabase/functions/list-stripe-invoices/index.ts` | Remapear campos para formato compatível com frontend |

---

## ⚠️ Nota sobre a Assinatura

A assinatura **foi criada com sucesso** no Stripe (`sub_1SwC5RPuIhszhOCI4Rzxs6f0`).
- Status: `incomplete` (aguardando primeiro pagamento)
- Cliente: `cus_TtzgYrnbQ5fSYj`
- 2 faturas em aberto de R$ 197,00

Quando o cliente pagar a primeira fatura, o status mudará para `active` e o webhook vai atualizar o banco de dados.
