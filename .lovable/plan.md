

# Plano: Sistema de Pagamento Integrado + Trial

## Resumo das Suas Ideias

Você propôs duas melhorias excelentes:

1. **Configurações > Meu Plano** - Adicionar opção de pagamento/assinatura para quem está em TRIAL
2. **Cadastro** - Duas opções:
   - **Pagar agora** → acesso imediato
   - **Trial grátis** → aprovação automática ou manual (configurável via toggle)

---

## O Que Será Implementado

### 1. Página Meu Plano (MyPlanSettings.tsx)

Quando o cliente estiver em TRIAL, exibir:

```text
┌─────────────────────────────────────────────────────────────┐
│  ⏰ PERÍODO DE TESTE                                         │
│                                                             │
│  Seu trial termina em: 5 de fevereiro de 2026              │
│  Plano selecionado: Starter                                 │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  💳 ASSINAR AGORA - R$ 497,00/mês                     │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Após o pagamento, seu acesso é liberado automaticamente.  │
└─────────────────────────────────────────────────────────────┘
```

O botão gera um link de pagamento no ASAAS e redireciona o cliente.

---

### 2. Página de Cadastro (Register.tsx)

Adicionar seleção de modo de entrada:

```text
┌─────────────────────────────────────────────────────────────┐
│                    COMO DESEJA COMEÇAR?                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐   ┌─────────────────────┐         │
│  │  💳 PAGAR AGORA     │   │  🎁 TRIAL GRÁTIS   │         │
│  │                     │   │                     │         │
│  │  Acesso imediato    │   │  7 dias grátis     │         │
│  │  após pagamento     │   │  para testar       │         │
│  └─────────────────────┘   └─────────────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Fluxo "Pagar Agora":**
- Redireciona para checkout ASAAS
- Após pagamento confirmado via webhook → empresa criada como `approved`

**Fluxo "Trial Grátis":**
- Se `auto_approve_trial` = true → empresa aprovada automaticamente
- Se `auto_approve_trial` = false → empresa fica pendente para admin aprovar

---

### 3. Nova Configuração no Admin Global (GlobalAdminSettings.tsx)

Toggle para aprovação automática de trials:

```text
┌─────────────────────────────────────────────────────────────┐
│  ⚡ Aprovação Automática de Trial                           │
│                                                             │
│  Quando ativado, empresas que escolhem trial são           │
│  aprovadas automaticamente sem intervenção manual.         │
│                                                             │
│                                          [TOGGLE] ⚪───     │
└─────────────────────────────────────────────────────────────┘
```

---

### 4. Página Trial Expirado (TrialExpired.tsx)

Adicionar botão "Pagar Agora":

```text
┌─────────────────────────────────────────────────────────────┐
│           ⏰ Período de Teste Encerrado                     │
│                                                             │
│   Seu trial terminou em 29 de janeiro de 2026              │
│                                                             │
│   Para continuar usando o MiauChat com o                   │
│   plano Starter, efetue o pagamento.                       │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐  │
│   │  💳 PAGAR AGORA - R$ 497,00/mês                    │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│   [ Falar com Suporte ]   [ WhatsApp ]                     │
│                                                             │
│              Sair da conta                                  │
└─────────────────────────────────────────────────────────────┘
```

---

### 5. Webhook ASAAS (Nova Edge Function)

Para receber confirmação de pagamento e ativar a conta:

| Evento | Ação |
|--------|------|
| `PAYMENT_CONFIRMED` | Empresa status → `active`, remove bloqueio trial |
| `PAYMENT_RECEIVED` | Atualiza último pagamento |
| `PAYMENT_OVERDUE` | Marca empresa como inadimplente |

---

### 6. Edge Function: generate-payment-link

Gera link de pagamento ASAAS para empresa existente:

```typescript
// Input
{
  company_id: "uuid",
  billing_type: "CREDIT_CARD" | "BOLETO" | "PIX"
}

// Output
{
  payment_url: "https://www.asaas.com/c/xxx",
  expires_at: "2026-02-05"
}
```

---

### 7. Tabela de Controle (Banco de Dados)

Nova tabela `company_subscriptions`:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Identificador |
| company_id | uuid | FK → companies |
| asaas_customer_id | text | ID no ASAAS |
| asaas_subscription_id | text | ID da assinatura |
| status | text | pending, active, cancelled, overdue |
| current_period_end | timestamp | Fim do período |
| last_payment_at | timestamp | Último pagamento |
| created_at | timestamp | Criação |

---

## Arquivos a Serem Modificados/Criados

### Novos Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/asaas-webhook/index.ts` | Recebe eventos de pagamento |
| `supabase/functions/generate-payment-link/index.ts` | Gera link para empresa existente |

### Arquivos Modificados

| Arquivo | Modificação |
|---------|-------------|
| `src/components/settings/MyPlanSettings.tsx` | Seção de trial + botão assinar |
| `src/pages/Register.tsx` | Seleção Trial vs Pagar Agora |
| `src/pages/TrialExpired.tsx` | Botão "Pagar Agora" |
| `src/pages/global-admin/GlobalAdminSettings.tsx` | Toggle aprovação automática |
| `supabase/functions/register-company/index.ts` | Suporte a auto-aprovação trial |

### Migração SQL

```sql
-- Tabela de assinaturas
CREATE TABLE public.company_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  asaas_customer_id text,
  asaas_subscription_id text,
  status text DEFAULT 'pending',
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  last_payment_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Nova configuração para auto-aprovar trial
INSERT INTO system_settings (key, value, category, description)
VALUES ('auto_approve_trial_enabled', 'false', 'registration', 
        'Quando ativado, empresas que escolhem trial são aprovadas automaticamente');
```

---

## Fluxo Completo Após Implementação

```text
                         CADASTRO
                            │
            ┌───────────────┴───────────────┐
            │                               │
      💳 PAGAR AGORA                  🎁 TRIAL GRÁTIS
            │                               │
            ▼                               ▼
      Checkout ASAAS              auto_approve = true?
            │                         │         │
            │                        SIM       NÃO
            │                         │         │
            │                         ▼         ▼
            │                    Aprovado   Pendente
            │                    7 dias     Admin
            │                    trial      aprova
            │                         │         │
            │                         └────┬────┘
            │                              │
            ▼                              ▼
     Webhook confirma              Usuário acessa
     pagamento                     sistema (trial)
            │                              │
            ▼                              ▼
     Empresa ATIVA               Trial expira em 7 dias
     (status = active)                     │
                                           ▼
                              Página TrialExpired
                                           │
                                           ▼
                              Botão "Pagar Agora"
                                           │
                                           ▼
                              Webhook confirma
                                           │
                                           ▼
                              Empresa ATIVA
```

---

## Configuração Necessária

### Secret para Webhook

Será necessário um token para validar webhooks do ASAAS:
- `ASAAS_WEBHOOK_TOKEN` - Token secreto configurado no painel ASAAS

### Configurar Webhook no ASAAS

No painel ASAAS, adicionar:
- **URL**: `https://jiragtersejnarxruqyd.supabase.co/functions/v1/asaas-webhook`
- **Eventos**: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE

---

## Ordem de Implementação

1. Migração SQL - Criar tabela `company_subscriptions` e config
2. Edge Function `generate-payment-link` - Gerar links de pagamento
3. Edge Function `asaas-webhook` - Receber eventos
4. Modificar `MyPlanSettings` - Seção trial + botão assinar
5. Modificar `TrialExpired` - Botão "Pagar Agora"
6. Modificar `Register` - Seleção Trial vs Pagar
7. Modificar `GlobalAdminSettings` - Toggle auto-aprovação
8. Atualizar `register-company` - Lógica de auto-aprovação

