
# Plano: Função de Cobrança por Email para Empresas Inadimplentes

## Resumo

Implementar a funcionalidade do botão **"Cobrar"** que envia um email automático para a empresa inadimplente, notificando sobre o pagamento pendente e incluindo link para regularização.

---

## Análise das Alterações Feitas Hoje

### ✅ Funcionando Corretamente

| Componente | Status | Descrição |
|------------|--------|-----------|
| `CompanySuspended.tsx` | ✅ OK | Página amigável com mensagem "Conta Suspensa" e botão "Regularizar Agora" |
| `ProtectedRoute.tsx` | ✅ OK | Verifica `company_status === 'suspended'` e bloqueia acesso |
| `useCompanyApproval.tsx` | ✅ OK | Busca `status`, `suspended_reason` da empresa |
| `useCompanies.tsx` | ✅ OK | Mutations `suspendCompany` e `unsuspendCompany` + subscription join |
| `GlobalAdminCompanies.tsx` | ✅ OK | Opções de Suspender/Liberar no dropdown + coluna Faturamento |
| `GlobalAdminPayments.tsx` | ✅ OK (após fix) | Optional chaining corrigido para `metrics?.stripe?.connected` |
| `BillingOverdueList.tsx` | ✅ OK | Botão "Cobrar" chamando `onSendReminder` (atualmente placeholder) |
| Migração SQL | ✅ OK | Colunas `suspended_at`, `suspended_by`, `suspended_reason` adicionadas |

### ⚠️ Pendente (A Implementar)

O botão **"Cobrar"** atualmente mostra apenas um toast:
```typescript
const handleSendReminder = (paymentId: string, companyName: string) => {
  toast.info(`Função de cobrança para ${companyName} em desenvolvimento`);
};
```

---

## Implementação da Função de Cobrança

### 1. Nova Edge Function: `send-billing-reminder`

Criar função que:
1. Recebe `invoice_id` ou `company_id` do Stripe
2. Busca dados da empresa (email, nome, plano, valor)
3. Busca ou gera link de pagamento (Stripe Hosted Invoice URL)
4. Envia email via Resend com template profissional
5. Registra o envio para controle

**Dados da requisição:**
```typescript
{
  invoice_id?: string;      // ID da invoice Stripe (preferencial)
  company_id?: string;      // Fallback se não tiver invoice
  custom_message?: string;  // Mensagem personalizada (opcional)
}
```

**Resposta:**
```typescript
{
  success: boolean;
  email_sent_to: string;
  payment_url: string;
  invoice_amount: number;
}
```

### 2. Template de Email de Cobrança

**Assunto:** 📋 Aviso de Pagamento Pendente — MiauChat

**Conteúdo:**
```
┌─────────────────────────────────────────────────────────────────────┐
│                      [Logo MiauChat]                                │
│                                                                     │
│           💳 Aviso de Pagamento Pendente                            │
│                                                                     │
│   Olá, [Nome da Empresa]!                                           │
│                                                                     │
│   Identificamos uma pendência financeira em sua conta:              │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  Valor: R$ 497,00                                           │   │
│   │  Plano: Starter                                              │   │
│   │  Vencimento: 01/02/2026                                      │   │
│   │  Dias em atraso: 3                                           │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   Para continuar utilizando o MiauChat normalmente,                 │
│   regularize seu pagamento clicando no botão abaixo:                │
│                                                                     │
│         ┌───────────────────────────────────────────┐               │
│         │  💳 Regularizar Pagamento Agora            │               │
│         └───────────────────────────────────────────┘               │
│                                                                     │
│   Caso já tenha efetuado o pagamento, desconsidere este aviso.      │
│                                                                     │
│   Dúvidas? Entre em contato:                                        │
│   📧 suporte@miauchat.com.br                                         │
│   📱 WhatsApp: (XX) XXXXX-XXXX                                       │
│                                                                     │
│                  — MIAUCHAT                                         │
└─────────────────────────────────────────────────────────────────────┘
```

### 3. Atualizar Frontend

**Em `GlobalAdminPayments.tsx`:**
- Alterar `handleSendReminder` para chamar a nova Edge Function
- Adicionar estado de loading por invoice
- Mostrar confirmação antes de enviar
- Toast de sucesso/erro após envio

```typescript
const [sendingReminder, setSendingReminder] = useState<string | null>(null);

const handleSendReminder = async (paymentId: string, companyName: string) => {
  // Confirm before sending
  const confirmed = confirm(`Enviar email de cobrança para ${companyName}?`);
  if (!confirmed) return;
  
  setSendingReminder(paymentId);
  try {
    const { data, error } = await supabase.functions.invoke("send-billing-reminder", {
      body: { invoice_id: paymentId }
    });
    
    if (error) throw error;
    
    toast.success(`Email de cobrança enviado para ${data.email_sent_to}`);
  } catch (err) {
    toast.error(`Erro ao enviar cobrança: ${err.message}`);
  } finally {
    setSendingReminder(null);
  }
};
```

**Em `BillingOverdueList.tsx`:**
- Adicionar prop `loadingPaymentId` para indicar qual está em processo
- Mostrar spinner no botão "Cobrar" quando enviando

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/send-billing-reminder/index.ts` | **Criar** | Edge Function para enviar email de cobrança |
| `src/pages/global-admin/GlobalAdminPayments.tsx` | Modificar | Implementar `handleSendReminder` real |
| `src/components/global-admin/BillingOverdueList.tsx` | Modificar | Adicionar estado de loading |

---

## Fluxo Completo

```text
┌─────────────────────────────────────────────────────────────────────┐
│  1. Admin acessa Global Admin > Pagamentos > Inadimplência          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. Vê lista de empresas com faturas vencidas                       │
│     - Nome, plano, valor, dias em atraso                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. Clica no botão "Cobrar" em uma empresa                          │
│     - Confirma o envio no dialog                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. Edge Function send-billing-reminder:                            │
│     - Busca dados da fatura no Stripe                                │
│     - Busca email da empresa no Supabase                             │
│     - Gera email com template de cobrança                            │
│     - Envia via Resend                                               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. Cliente recebe email com:                                        │
│     - Valor pendente                                                 │
│     - Dias em atraso                                                 │
│     - Botão "Regularizar Pagamento"                                  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  6. Cliente clica no link → Stripe Checkout/Invoice Page            │
│     - Paga a fatura pendente                                        │
│     - Webhook atualiza status                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Dependências

| Requisito | Status |
|-----------|--------|
| `RESEND_API_KEY` | ✅ Configurado |
| `STRIPE_SECRET_KEY` | ✅ Configurado |
| Tabela `company_subscriptions` | ✅ Existe |
| Join com `companies` | ✅ Implementado |

---

## Segurança

1. **Autenticação obrigatória**: Apenas admins globais podem enviar cobranças
2. **Validação de invoice**: Verifica se a invoice pertence ao Stripe configurado
3. **Rate limiting natural**: Usa mesmo endpoint Resend com quota
4. **Logs de auditoria**: Registra quem enviou cobrança e quando

---

## Risco de Quebrar o Sistema

**Mínimo:**

1. **Nova Edge Function**: Não afeta código existente
2. **Mudança em handleSendReminder**: Troca placeholder por lógica real
3. **BillingOverdueList**: Apenas adiciona estado de loading visual
4. **Resend já configurado**: Mesma API usada para emails de auth

---

## Validações Pós-Implementação

- [ ] Botão "Cobrar" envia email corretamente
- [ ] Email chega com template correto
- [ ] Link de pagamento funciona
- [ ] Loading aparece no botão durante envio
- [ ] Toast de sucesso/erro aparece
- [ ] Fluxo de suspensão/liberação continua funcionando
- [ ] Dashboard de pagamentos não quebra
