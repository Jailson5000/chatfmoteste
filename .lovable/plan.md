
# Plano de Implementação: Sistema de Solicitação de Adicionais + PIX no Checkout

## Contexto do Problema

### 1. Solicitação de Adicionais não Funcional
O cliente pode solicitar adicionais (usuários/WhatsApp) em **Meu Plano → Contratar Adicionais**, mas:
- O sistema apenas exibe um toast de sucesso
- **Não há registro no banco de dados**
- **Global Admin não recebe notificação nem consegue aprovar**

### 2. PIX não Disponível no Checkout
Clientes em trial que clicam em "Pagar Agora" são redirecionados para o ASAAS, mas:
- A função `create-asaas-checkout` cria subscription com `billingType: "CREDIT_CARD"` fixo
- Isso impede que o cliente escolha PIX ou Boleto
- O correto seria usar `billingType: "UNDEFINED"` para permitir escolha

---

## Solução Proposta

### Parte 1: Sistema de Solicitação de Adicionais

#### 1.1 Nova Tabela `addon_requests`
```sql
CREATE TABLE addon_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id),
  law_firm_id UUID NOT NULL REFERENCES law_firms(id),
  requested_by UUID REFERENCES auth.users(id),
  -- Quantidades solicitadas
  additional_users INTEGER DEFAULT 0,
  additional_instances INTEGER DEFAULT 0,
  -- Valor calculado
  monthly_cost DECIMAL(10,2),
  -- Status do fluxo
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  -- Ações do admin
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 1.2 Notificação para Global Admin
- Trigger automático que cria notificação ao inserir na tabela
- Tipo de notificação: `ADDON_REQUEST`
- Aparece no sino de notificações do Global Admin

#### 1.3 Atualização do Cliente (`MyPlanSettings.tsx`)
- Ao clicar "Solicitar Adicionais", inserir registro na tabela `addon_requests`
- Exibir histórico de solicitações com status

#### 1.4 Nova Aba no Global Admin
- Exibir solicitações pendentes na página de Empresas ou nova aba dedicada
- Botões: **Aprovar** (atualiza limites da empresa) / **Rejeitar** (com motivo)
- Aprovação automática atualiza `max_users` e `max_instances` da empresa

---

### Parte 2: Habilitar PIX no Checkout

#### 2.1 Corrigir `create-asaas-checkout/index.ts`
```typescript
// ANTES (linha 152)
billingType: "CREDIT_CARD",

// DEPOIS
billingType: "UNDEFINED", // Permite PIX, Boleto e Cartão
```

#### 2.2 Corrigir `generate-payment-link/index.ts`
Já está correto com `billingType: "UNDEFINED"`, mas validar que o link de pagamento permite todas as opções.

#### 2.3 Garantir Recorrência
Manter `chargeType: "RECURRENT"` e `subscriptionCycle: "MONTHLY"` para cobranças mensais automáticas.

---

## Detalhes Técnicos

### Arquivos a Criar
| Arquivo | Descrição |
|---------|-----------|
| Migration SQL | Cria tabela `addon_requests` e trigger de notificação |

### Arquivos a Modificar
| Arquivo | Modificação |
|---------|-------------|
| `src/components/settings/MyPlanSettings.tsx` | Inserir no banco + exibir histórico |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Adicionar seção de solicitações pendentes |
| `supabase/functions/create-asaas-checkout/index.ts` | Alterar `billingType` para `UNDEFINED` |

### Fluxo de Aprovação de Adicionais
```text
┌──────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│  Cliente solicita│ →  │ Registro na tabela │ →  │ Notificação Admin  │
│  em Meu Plano    │    │ addon_requests     │    │ (sino vermelho)    │
└──────────────────┘    └────────────────────┘    └────────────────────┘
                                                           │
                                                           ▼
┌──────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│  Empresa ativada │ ←  │ Admin atualiza     │ ←  │ Admin aprova       │
│  com novos limites│   │ max_users/instances│    │ na aba Empresas    │
└──────────────────┘    └────────────────────┘    └────────────────────┘
```

### Fluxo de Checkout com PIX
```text
┌──────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│  Cliente em trial│ →  │ Clica "Pagar Agora"│ →  │ create-asaas-      │
│  ou Trial Expired│    │                    │    │ checkout invocado  │
└──────────────────┘    └────────────────────┘    └────────────────────┘
                                                           │
                                                           ▼
┌──────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│  Webhook ativa   │ ←  │ Cliente escolhe    │ ←  │ ASAAS exibe PIX,   │
│  empresa paga    │    │ PIX/Boleto/Cartão  │    │ Boleto e Cartão    │
└──────────────────┘    └────────────────────┘    └────────────────────┘
```

---

## Benefícios

1. **Fluxo completo de adicionais**: Solicitação → Notificação → Aprovação → Ativação
2. **Mais opções de pagamento**: PIX é preferido por muitos clientes brasileiros
3. **Rastreabilidade**: Histórico de solicitações e aprovações
4. **Recorrência garantida**: Cobranças automáticas mensais após primeiro pagamento
