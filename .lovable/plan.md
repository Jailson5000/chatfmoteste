
# Plano: Correção do Fluxo ASAAS e Testes de Webhook

## Problemas Identificados

### 1. `externalReference` Excedendo 100 Caracteres
O ASAAS limita o campo `externalReference` a 100 caracteres. A função `admin-create-asaas-subscription` gera uma referência muito longa:
```
company:a5e5147b-0d98-4d87-ab95-fd30c03e52d7;plan:d0cec231-ff01-4874-b5e7-e777d551f89f;period:monthly;admin_created:true
// Total: ~120 caracteres - ERRO!
```

### 2. Formato Inconsistente do `externalReference`
Cada Edge Function usa um formato diferente:

| Função | Formato | Company ID |
|--------|---------|------------|
| `generate-payment-link` | `company:UUID;plan:UUID;period:X` | ✅ Sim |
| `admin-create-asaas-subscription` | `company:UUID;plan:UUID;period:X;admin:true` | ✅ Sim (mas muito longo) |
| `create-asaas-checkout` | `source:miauchat;plan:X;period:X` | ❌ NÃO! |

O webhook não consegue identificar a empresa quando vem do checkout da landing page!

### 3. Webhook Sem Atividade
- Nenhum log encontrado = ASAAS ainda não enviou webhooks
- Possíveis causas:
  - Webhook não configurado no painel ASAAS
  - Nenhum pagamento foi confirmado ainda
  - Token de autenticação incorreto

---

## Correções Necessárias

### Correção 1: Padronizar `externalReference` (Todas as Funções)

**Novo formato padrão (máximo 100 chars):**
```typescript
// Formato curto e seguro
const shortCompanyId = companyId.split("-")[0]; // Primeiros 8 chars do UUID
const externalReference = `co:${shortCompanyId};pl:${planKey};pe:${period}`.slice(0, 100);
// Exemplo: "co:a5e5147b;pl:basic;pe:monthly" (~35 chars)
```

**OU usar apenas company_id (recomendado):**
```typescript
const externalReference = `company_${companyId}`.slice(0, 100);
// O webhook já busca por company_id no company_subscriptions como fallback
```

### Correção 2: Atualizar `admin-create-asaas-subscription`
```typescript
// ANTES (erro)
const externalReference = `company:${company.id};plan:${company.plan.id};period:${billing_type};admin_created:true`;

// DEPOIS (corrigido)
const externalReference = `company:${company.id}`.slice(0, 100);
```

### Correção 3: Atualizar `generate-payment-link`
```typescript
// ANTES (pode exceder)
const externalReference = `company:${company.id};plan:${company.plan.id};period:${billing_type}`;

// DEPOIS (seguro)
const externalReference = `company:${company.id}`.slice(0, 100);
```

### Correção 4: Atualizar `create-asaas-checkout`

Esta função é usada na **landing page** para novos registros. O problema é que não há `company_id` ainda (a empresa não foi criada).

**Solução:** Após o webhook confirmar o pagamento, usar o `customerId` do ASAAS para vincular:

1. Salvar `asaas_customer_id` no registro de `company_subscriptions` quando a empresa for provisionada
2. O webhook já tem fallback para buscar por `asaas_customer_id`

**OU** incluir dados identificáveis no `externalReference`:
```typescript
// Incluir email no externalReference para identificação posterior
const externalReference = `email:${adminEmail};plan:${planKey}`.slice(0, 100);
```

### Correção 5: Melhorar Lógica do Webhook

Atualizar `asaas-webhook` para:
1. Suportar múltiplos formatos de `externalReference`
2. Buscar por email se não encontrar por company_id
3. Logar melhor para debug

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/admin-create-asaas-subscription/index.ts` | Encurtar `externalReference` |
| `supabase/functions/generate-payment-link/index.ts` | Adicionar `.slice(0, 100)` |
| `supabase/functions/create-asaas-checkout/index.ts` | Incluir email no `externalReference` |
| `supabase/functions/asaas-webhook/index.ts` | Melhorar parsing e fallbacks |

---

## Passos para Testar o Webhook

### Passo 1: Configurar Webhook no Painel ASAAS

Verificar se está configurado:
- **URL:** `https://jiragtersejnarxruqyd.supabase.co/functions/v1/asaas-webhook`
- **Token:** Valor do secret `ASAAS_WEBHOOK_TOKEN`
- **Eventos:** 
  - `PAYMENT_CONFIRMED`
  - `PAYMENT_RECEIVED`
  - `PAYMENT_OVERDUE`
  - `SUBSCRIPTION_CANCELLED`

### Passo 2: Gerar Cobrança de Teste (após correções)

1. No painel Global Admin > Empresas
2. Clicar "Gerar Cobrança ASAAS" em uma empresa
3. Escolher período (Mensal)
4. Copiar link gerado
5. Fazer pagamento de teste no sandbox ASAAS (se disponível) ou aguardar cliente real

### Passo 3: Verificar Logs

Após correções, os logs mostrarão:
```
[asaas-webhook] Received event: PAYMENT_CONFIRMED {...}
[asaas-webhook] Processing event for company: a5e5147b-0d98-4d87-ab95-fd30c03e52d7
[asaas-webhook] Company activated successfully: a5e5147b-0d98-4d87-ab95-fd30c03e52d7
```

### Passo 4: Verificar Banco de Dados

```sql
SELECT * FROM audit_logs WHERE action = 'PAYMENT_CONFIRMED' ORDER BY created_at DESC;
SELECT * FROM company_subscriptions WHERE status = 'active';
SELECT * FROM companies WHERE trial_type = 'paid';
```

---

## Fluxo Corrigido

```text
┌─────────────────────────────────────────────────────────────┐
│  ADMIN GERA COBRANÇA (ou cliente assina)                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Edge Function gera link com:                                │
│  externalReference = "company:UUID" (≤100 chars)            │
│  Salva asaas_customer_id no company_subscriptions           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Cliente paga no ASAAS                                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  ASAAS envia webhook: PAYMENT_CONFIRMED                      │
│  Header: asaas-access-token = ASAAS_WEBHOOK_TOKEN           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  asaas-webhook processa:                                     │
│  1. Valida token                                             │
│  2. Extrai company_id do externalReference                  │
│  3. Fallback: busca por asaas_customer_id                   │
│  4. Atualiza company_subscriptions.status = 'active'        │
│  5. Atualiza companies.approval_status = 'approved'         │
│  6. Registra audit_log                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Ordem de Implementação

1. **Corrigir `admin-create-asaas-subscription`** - Encurtar externalReference
2. **Corrigir `generate-payment-link`** - Adicionar .slice(0, 100)
3. **Corrigir `create-asaas-checkout`** - Incluir email para identificação
4. **Melhorar `asaas-webhook`** - Adicionar fallback por email
5. **Deploy e testar** - Gerar cobrança de teste
6. **Verificar logs** - Confirmar que webhook está funcionando
