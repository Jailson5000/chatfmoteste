
# Plano: Correção do Sistema de Faturamento e Adicionais

## Problemas Identificados

### 1. Fatura não aparece no ASAAS nem para o cliente
**Causa raiz**: A tabela `company_subscriptions` não possui um UNIQUE constraint na coluna `company_id`, fazendo com que o upsert falhe silenciosamente.

```sql
-- Índice atual (NÃO é unique):
CREATE INDEX idx_company_subscriptions_company ON company_subscriptions USING btree (company_id)
```

**Resultado**: O `asaas_customer_id` não é salvo, então quando o cliente clica em "Ver Faturas", a função `list-asaas-invoices` não encontra o customer ID e retorna "Nenhuma fatura encontrada".

### 2. Valor dos adicionais não aparece na fatura do ASAAS
**Causa raiz**: Tanto `admin-create-asaas-subscription` quanto `generate-payment-link` calculam o valor da assinatura apenas usando o preço do plano base (`company.plan.price`), sem considerar os adicionais aprovados.

```typescript
// Código atual (linha 178-180):
const monthlyPrice = company.plan.price || 0;
const yearlyPrice = monthlyPrice * 11;
const priceInReais = billing_type === "yearly" ? yearlyPrice : monthlyPrice;
// ❌ Não considera adicionais!
```

### 3. Resumo Mensal não exibe breakdown claro
**Análise**: O código de `MyPlanSettings.tsx` já exibe corretamente o breakdown quando há adicionais (linhas 445-475), mas precisamos melhorar a clareza visual para o cliente entender melhor.

---

## Solução Proposta

### Parte 1: Corrigir Banco de Dados

Adicionar UNIQUE constraint na tabela `company_subscriptions`:

```sql
-- Adicionar unique constraint para permitir upsert funcionar
ALTER TABLE company_subscriptions 
ADD CONSTRAINT company_subscriptions_company_id_unique UNIQUE (company_id);
```

### Parte 2: Calcular Valor Total com Adicionais nas Edge Functions

Modificar as Edge Functions para buscar e calcular os adicionais:

#### 2.1 `admin-create-asaas-subscription/index.ts`
```typescript
// 1. Buscar limites do plano
const planLimits = {
  max_users: company.plan.max_users || 0,
  max_instances: company.plan.max_instances || 0,
};

// 2. Buscar limites efetivos da empresa (com adicionais)
const effectiveLimits = {
  max_users: company.max_users || planLimits.max_users,
  max_instances: company.max_instances || planLimits.max_instances,
  use_custom_limits: company.use_custom_limits || false,
};

// 3. Calcular adicionais
const additionalUsers = Math.max(0, effectiveLimits.max_users - planLimits.max_users);
const additionalInstances = Math.max(0, effectiveLimits.max_instances - planLimits.max_instances);

const usersCost = additionalUsers * 47.90;
const instancesCost = additionalInstances * 79.90;
const totalAdditional = usersCost + instancesCost;

// 4. Preço final
const basePlanPrice = company.plan.price || 0;
const monthlyPrice = basePlanPrice + totalAdditional;
```

#### 2.2 `generate-payment-link/index.ts`
Aplicar a mesma lógica de cálculo.

### Parte 3: Melhorar Exibição do Resumo Mensal

Atualizar `MyPlanSettings.tsx` para exibir claramente:

```text
┌─────────────────────────────────────┐
│       Resumo Mensal                 │
├─────────────────────────────────────┤
│ Plano ENTERPRISE         R$ 1.697,00│
│                                     │
│ ADICIONAIS CONTRATADOS:             │
│ +2 usuário(s)            R$   95,80 │
│ +1 conexão(ões) WhatsApp R$   79,90 │
├─────────────────────────────────────┤
│ TOTAL MENSAL             R$ 1.872,70│
└─────────────────────────────────────┘
```

### Parte 4: Melhorar Feedback nas Faturas

Adicionar no diálogo de faturas a descrição que vem do ASAAS incluindo os adicionais:

```text
Descrição da fatura:
"Assinatura MiauChat ENTERPRISE - FMO Advogados
 Inclui: +2 usuários, +1 WhatsApp"
```

---

## Detalhes Técnicos

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| Migration SQL | Adicionar UNIQUE constraint em `company_subscriptions.company_id` |
| `supabase/functions/admin-create-asaas-subscription/index.ts` | Calcular valor com adicionais + melhorar descrição + logging de upsert |
| `supabase/functions/generate-payment-link/index.ts` | Calcular valor com adicionais + melhorar descrição |
| `src/components/settings/MyPlanSettings.tsx` | Melhorar visual do Resumo Mensal com labels claros |

### Fluxo Corrigido

```text
┌─────────────────────┐
│ Admin gera fatura   │
│ para empresa FMO    │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐    ┌──────────────────────────────┐
│ Edge Function busca │ →  │ Plano: ENTERPRISE = R$ 1.697 │
│ plano + adicionais  │    │ +2 users = R$ 95,80          │
└─────────────────────┘    │ +1 WhatsApp = R$ 79,90       │
                           │ TOTAL = R$ 1.872,70          │
                           └──────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────┐    ┌──────────────────────────────┐
│ ASAAS cria payment  │ ←  │ Descrição: "ENTERPRISE +     │
│ link com valor total│    │ 2 usuários, 1 WhatsApp"      │
└─────────────────────┘    └──────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────┐    ┌──────────────────────────────┐
│ company_subscriptions│ ←  │ asaas_customer_id salvo      │
│ atualizado          │    │ (UNIQUE constraint funciona) │
└─────────────────────┘    └──────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────┐    ┌──────────────────────────────┐
│ Cliente vê faturas  │ →  │ list-asaas-invoices encontra │
│ em "Meu Plano"      │    │ customer_id e retorna faturas│
└─────────────────────┘    └──────────────────────────────┘
```

---

## Benefícios

1. **Faturamento Correto**: O valor cobrado no ASAAS refletirá o plano base + adicionais
2. **Faturas Visíveis**: O cliente verá suas faturas em "Meu Plano → Ver Faturas"
3. **Transparência**: Descrição clara do que está sendo cobrado
4. **Persistência**: O `asaas_customer_id` será salvo corretamente para futuras consultas
5. **Resumo Claro**: O cliente verá exatamente o breakdown do que está pagando
