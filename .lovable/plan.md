

# Atualização de Preços Adicionais em Todo o Sistema

## Objetivo

Atualizar os preços de recursos adicionais para os novos valores em **todos os locais** do sistema, garantindo consistência total.

---

## Novos Valores

| Recurso | Valor Atual | Novo Valor |
|---------|-------------|------------|
| WhatsApp adicional | R$ 79,90/mês | **R$ 57,90/mês** |
| Atendente adicional | R$ 47,90/mês | **R$ 29,90/mês** |
| Conversa IA adicional | R$ 0,47/conversa | **R$ 0,27/conversa** |
| Áudio TTS adicional | R$ 1,47/minuto | **R$ 0,97/minuto** |

---

## Arquivos a Modificar

### 1. Frontend - Configuração Centralizada

**`src/lib/billing-config.ts`** (linhas 6-15)

| Campo | Antes | Depois |
|-------|-------|--------|
| whatsappInstance | 79.90 | 57.90 |
| user | 47.90 | 29.90 |
| aiConversation | 0.47 | 0.27 |
| ttsMinute | 1.47 | 0.97 |

---

### 2. Frontend - Landing Page

**`src/pages/landing/LandingPage.tsx`** (linhas 140-145)

```typescript
// ANTES
const additionalPricing = [
  { item: "Conversa adicional com IA", price: "R$ 0,47 / conversa" },
  { item: "Minuto adicional de áudio", price: "R$ 1,47 / minuto" },
  { item: "WhatsApp adicional", price: "R$ 79,90 / mês" },
  { item: "Atendente adicional", price: "R$ 47,90 / mês" },
];

// DEPOIS
const additionalPricing = [
  { item: "Conversa adicional com IA", price: "R$ 0,27 / conversa" },
  { item: "Minuto adicional de áudio", price: "R$ 0,97 / minuto" },
  { item: "WhatsApp adicional", price: "R$ 57,90 / mês" },
  { item: "Atendente adicional", price: "R$ 29,90 / mês" },
];
```

---

### 3. Frontend - Admin Global Empresas

**`src/pages/global-admin/GlobalAdminCompanies.tsx`** (linha 353)

```typescript
// ANTES
newMonthlyValue += (additionalUsers * 47.90) + (additionalInstances * 79.90);

// DEPOIS  
newMonthlyValue += (additionalUsers * 29.90) + (additionalInstances * 57.90);
```

---

### 4. Edge Function - Criar Assinatura ASAAS

**`supabase/functions/admin-create-asaas-subscription/index.ts`** (linhas 229-230)

```typescript
// ANTES
const PRICING_USER = 47.90;
const PRICING_INSTANCE = 79.90;

// DEPOIS
const PRICING_USER = 29.90;
const PRICING_INSTANCE = 57.90;
```

---

### 5. Edge Function - Gerar Link de Pagamento

**`supabase/functions/generate-payment-link/index.ts`** (linhas 179-180)

```typescript
// ANTES
const PRICING_USER = 47.90;
const PRICING_INSTANCE = 79.90;

// DEPOIS
const PRICING_USER = 29.90;
const PRICING_INSTANCE = 57.90;
```

---

## Resumo das Alterações

| Arquivo | Tipo | Alteração |
|---------|------|-----------|
| `src/lib/billing-config.ts` | Frontend | Configuração centralizada de preços |
| `src/pages/landing/LandingPage.tsx` | Frontend | Exibição na seção "Consumo adicional" |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Frontend | Cálculo de valor mensal ao editar empresa |
| `supabase/functions/admin-create-asaas-subscription/index.ts` | Backend | Cálculo de assinatura ASAAS |
| `supabase/functions/generate-payment-link/index.ts` | Backend | Cálculo de link de pagamento |

---

## Impacto

1. **Landing Page**: Novos visitantes verão os preços atualizados
2. **Admin Global**: Cálculos de custo de adicionais usarão novos valores
3. **ASAAS**: Novas assinaturas e links de pagamento usarão novos valores
4. **Clientes existentes**: Não são afetados automaticamente (assinaturas existentes mantêm valores anteriores)

---

## Garantias

- Alterações apenas nos valores numéricos
- Estrutura do código inalterada
- Consistência entre frontend e backend
- Edge Functions serão redeployadas automaticamente

