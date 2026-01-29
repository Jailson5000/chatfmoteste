# Plano: Sistema de Cadastro e Faturamento

## ✅ Implementações Concluídas

### 1. Formulário de Cadastro (Register.tsx)
- ✅ CPF/CNPJ e Telefone obrigatórios
- ✅ Seleção Trial vs Pagar Agora
- ✅ Integração com ASAAS para pagamento
- ✅ Auto-aprovação de trial (quando habilitado)

### 2. Configurações de Plano (MyPlanSettings.tsx)
- ✅ Botão "Solicitar Upgrade" envia WhatsApp com dados da empresa
- ✅ Botão "Ver Faturas" busca faturas reais do ASAAS
- ✅ Botão "Demonstrativo" gera PDF local (backup)
- ✅ Integração completa com ASAAS

### 3. Edge Functions
- ✅ `register-company` - Cadastro com auto-aprovação trial
- ✅ `generate-payment-link` - Gera link de pagamento ASAAS
- ✅ `list-asaas-invoices` - Lista faturas do ASAAS
- ✅ `asaas-webhook` - Processa confirmações de pagamento
- ✅ `create-asaas-checkout` - Checkout para novos cadastros

### 4. Configuração Centralizada
- ✅ `SUPPORT_CONFIG` em production-config.ts
- ✅ WhatsApp do suporte: 63 9 9954 0484
- ✅ Email do suporte: suporte@miauchat.com.br

---

## Fluxo de Pagamento ASAAS

```
┌─────────────────────────────────────────────────────────────┐
│  USUÁRIO CLICA "ASSINAR" ou "VER FATURAS"                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌─────────────────────┐       ┌─────────────────────────┐
│ generate-payment-   │       │ list-asaas-invoices     │
│ link                │       │                         │
│ - Cria cliente ASAAS│       │ - Busca faturas         │
│ - Gera link checkout│       │ - Retorna histórico     │
└─────────┬───────────┘       └─────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│  CHECKOUT ASAAS (PIX, Cartão, Boleto)                       │
└─────────────────────────┬───────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│  WEBHOOK → asaas-webhook                                     │
│  - PAYMENT_CONFIRMED: Ativa empresa                          │
│  - PAYMENT_OVERDUE: Marca como inadimplente                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Configuração do Webhook ASAAS

**URL do Webhook:**
```
https://jiragtersejnarxruqyd.supabase.co/functions/v1/asaas-webhook
```

**Eventos a configurar:**
- PAYMENT_CONFIRMED
- PAYMENT_RECEIVED  
- PAYMENT_OVERDUE
- SUBSCRIPTION_CANCELLED

**Token:** Use a variável `ASAAS_WEBHOOK_TOKEN` configurada nos secrets.

---

## Arquivos Modificados

| Arquivo | Modificação |
|---------|-------------|
| `src/lib/production-config.ts` | SUPPORT_CONFIG com WhatsApp real |
| `src/lib/schemas/companySchema.ts` | CPF/Telefone obrigatórios |
| `src/pages/Register.tsx` | Seleção Trial/Pagar |
| `src/components/settings/MyPlanSettings.tsx` | Botão WhatsApp + Ver Faturas |
| `src/pages/TrialExpired.tsx` | WhatsApp correto |
| `supabase/functions/list-asaas-invoices/index.ts` | Nova edge function |
| `supabase/functions/register-company/index.ts` | Auto-aprovação trial |
