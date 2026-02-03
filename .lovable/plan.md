
# Plano: Corrigir Dashboard de Pagamentos e Remover ASAAS

## Problemas Identificados

### Problema 1: Erro JavaScript (Tela Preta)

**Causa Raiz:**
- A Edge Function `get-payment-metrics` retorna apenas o objeto `stripe`
- O frontend (`GlobalAdminPayments.tsx`) espera **ambos** `stripe` e `asaas`
- Quando tenta acessar `metrics.asaas.connected` (linha 399), `asaas` é `undefined`
- Resultado: `Uncaught TypeError: Cannot read properties of undefined (reading 'connected')`

### Problema 2: Aba ASAAS Ainda Visível

- O frontend tem sub-tabs "Stripe" e "ASAAS" (linhas 388-430)
- A interface TypeScript ainda define `asaas: ProviderMetrics` (linha 31)
- Deveria ter sido removido na migração para Stripe-only

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/global-admin/GlobalAdminPayments.tsx` | Remover aba ASAAS, simplificar interface |
| `src/components/global-admin/CompanyLimitsEditor.tsx` | Corrigir texto que menciona ASAAS |

---

## Implementação Detalhada

### 1. Corrigir `GlobalAdminPayments.tsx`

**A. Atualizar interface PaymentMetrics (linha 28-32):**

```typescript
// ANTES (com bug)
interface PaymentMetrics {
  activeProvider: string;
  stripe: ProviderMetrics;
  asaas: ProviderMetrics;  // ← REMOVER
}

// DEPOIS (corrigido)
interface PaymentMetrics {
  activeProvider: string;
  stripe: ProviderMetrics;
}
```

**B. Remover sub-tabs de provedores e mostrar apenas Stripe:**

Remover as linhas 386-430 que contêm a estrutura de sub-tabs Stripe/ASAAS, substituindo por renderização direta dos dados do Stripe:

```typescript
{/* Overview Tab */}
<TabsContent value="overview" className="space-y-6">
  {metrics?.stripe && renderProviderMetrics(metrics.stripe, "Stripe")}
  {metrics && !metrics.stripe && (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <XCircle className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium">Stripe não configurado</h3>
      <p className="text-sm text-muted-foreground mt-2">
        Configure a STRIPE_SECRET_KEY para ver as métricas
      </p>
    </div>
  )}
</TabsContent>
```

### 2. Corrigir `CompanyLimitsEditor.tsx`

**Linha 238** - Trocar "ASAAS" por "Stripe":

```typescript
// ANTES
Isso reduzirá a cobrança mensal no ASAAS.

// DEPOIS
Isso reduzirá a cobrança mensal no Stripe.
```

---

## Resultado Esperado

```text
┌─────────────────────────────────────────────────────────────────────┐
│  Dashboard de Pagamentos                                            │
│  ─────────────────────────────────────────────────────────────────  │
│  Provedor ativo: [STRIPE ✓]                                         │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │ Visão Geral  │ │ Inadimplência│ │ Vencimentos  │                │
│  └──────────────┘ └──────────────┘ └──────────────┘                │
│                                                                     │
│  ❌ SEM ABA ASAAS - removida                                        │
│                                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                   │
│  │ MRR     │ │ ARR     │ │ Ativos  │ │ Clientes│                   │
│  │ R$ X,XX │ │ R$ X,XX │ │    X    │ │    X    │                   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                   │
│                                                                     │
│  Pagamentos Recentes                                                │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ R$ 197,00 | email@... | Pago | 02/02/2026                     │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Verificações de Segurança

| Verificação | Status |
|-------------|--------|
| Funcionalidade de cobrança | Não afetada (usa outras funções) |
| Aba Inadimplência | Preservada |
| Aba Vencimentos | Preservada |
| Refresh de dados | Preservado |
| Formatação de valores | Preservada |

---

## Risco de Quebrar o Sistema

**Mínimo:**
- Apenas removemos código morto (referências ao ASAAS)
- O backend já retorna apenas Stripe
- As funcionalidades principais de inadimplência/vencimentos não são afetadas
- Correção de texto é cosmética
