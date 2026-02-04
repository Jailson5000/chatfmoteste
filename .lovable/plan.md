
# Plano: Corrigir Liberação de Empresas + Erro de Cupom 100%

## Problemas Identificados

### 1. Cupom 100% de Desconto - Erro no `verify-payment`

**Log do erro:**
```
[VERIFY-PAYMENT] Metadata: { planKey: "starter", companyName: undefined, adminEmail: undefined }
```

**Causa raiz:** Quando o cupom é de 100%, o Stripe pode marcar a sessão como `complete` mas o `payment_status` pode ser `no_payment_required` em vez de `paid`. A função `verify-payment` só aceita `payment_status === "paid"`.

**Verificação adicional:** Os metadados `company_name` e `admin_email` não estão vindo porque o fluxo de checkout do landing page (`create-checkout-session`) não está sendo reconhecido, ou existe uma empresa já provisionada.

### 2. Liberação de Empresa Não Funciona

**Causa raiz:** A função `unsuspendCompany` funciona corretamente (status mudou para `active` no DB), mas:

1. O hook `useCompanyApproval` no cliente mantém cache do estado antigo
2. O usuário precisa recarregar a página ou fazer novo login para o `ProtectedRoute` liberar acesso

---

## Solução Proposta

### Alteração 1: `verify-payment` - Suportar Cupom 100%

**Arquivo:** `supabase/functions/verify-payment/index.ts`

Adicionar verificação para sessões com cupom de 100% onde `payment_status === "no_payment_required"`:

```typescript
// Linha 79-89 - ANTES:
if (session.payment_status !== "paid") {
  return new Response(...);
}

// DEPOIS:
const isPaid = session.payment_status === "paid";
const isNoPaymentRequired = session.payment_status === "no_payment_required" && session.status === "complete";

if (!isPaid && !isNoPaymentRequired) {
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: "Pagamento não confirmado",
      status: session.payment_status,
      session_status: session.status,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
}

console.log("[VERIFY-PAYMENT] Payment verified:", { 
  isPaid, 
  isNoPaymentRequired, 
  paymentStatus: session.payment_status 
});
```

### Alteração 2: `verify-payment` - Melhorar extração de metadados

Garantir que os metadados sejam extraídos corretamente:

```typescript
// Linha 93-98 - Melhorar extração
const metadata = session.metadata || {};
const planKey = metadata.plan || metadata.plan_name || "starter";
const companyName = metadata.company_name;
const adminName = metadata.admin_name;
const adminEmail = metadata.admin_email || session.customer_email || session.customer_details?.email;
const adminPhone = metadata.admin_phone;
const document = metadata.document;
```

### Alteração 3: `useCompanyApproval` - Força refresh após liberação

**Arquivo:** `src/hooks/useCompanyApproval.tsx`

Adicionar um trigger para refresh quando o usuário tenta acessar:

```typescript
// Adicionar refetch interval quando status é suspended
// Isso fará com que, ao ser liberado, o hook detecte automaticamente
```

### Alteração 4: `GlobalAdminCompanies` - Feedback visual após liberação

**Arquivo:** `src/pages/global-admin/GlobalAdminCompanies.tsx`

Adicionar mensagem de orientação ao liberar empresa:

```typescript
// Na função unsuspendCompany.onSuccess:
toast.success("Empresa liberada com sucesso!", {
  description: "O cliente precisa atualizar a página ou fazer login novamente para acessar."
});
```

### Alteração 5: Adicionar botão "Liberar Empresa" mais visível

Tornar a opção de "Liberar Empresa" mais proeminente quando a empresa está suspensa, adicionando um indicador visual na tabela e/ou um botão direto.

---

## Fluxo Corrigido - Cupom 100%

```text
1. Usuário aplica cupom de 100% no checkout
   ↓
2. Stripe completa sessão sem pagamento
   - payment_status: "no_payment_required"
   - session.status: "complete"
   ↓
3. verify-payment detecta condição especial
   - Aceita (paid || no_payment_required + complete)
   ↓
4. Provisionamento da empresa ocorre normalmente
   ↓
5. Email enviado ao cliente com credenciais
```

---

## Fluxo Corrigido - Liberação de Empresa

```text
1. Admin Global clica em "Liberar Empresa"
   ↓
2. unsuspendCompany atualiza status para 'active'
   ↓
3. Toast informa: "Cliente precisa atualizar a página"
   ↓
4. Cliente atualiza página ou faz login
   ↓
5. useCompanyApproval busca status atualizado
   ↓
6. ProtectedRoute permite acesso
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/verify-payment/index.ts` | Aceitar `no_payment_required` + melhorar extração de metadados |
| `src/hooks/useCompanyApproval.tsx` | (Opcional) Adicionar polling para detectar mudanças de status |
| `src/hooks/useCompanies.tsx` | Melhorar mensagem de sucesso do unsuspendCompany |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Adicionar indicador visual para empresas suspensas |

---

## Benefícios

1. **Cupom 100%**: Fluxo de provisionamento funciona mesmo sem pagamento real
2. **Liberação**: Admin tem feedback claro sobre próximos passos
3. **UX**: Cliente entende que precisa atualizar a página
4. **Segurança**: Nenhuma alteração em RLS ou permissões
5. **Retrocompatibilidade**: Fluxos existentes continuam funcionando

---

## Considerações de Segurança

- A lógica de `no_payment_required` só é aceita quando `session.status === "complete"`
- Isso garante que a sessão foi legitimamente concluída pelo Stripe
- Os webhooks do Stripe continuam funcionando normalmente para atualizar status

