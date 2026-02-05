

# Plano de Correção: PRIME Mensal no Stripe

## Problema Identificado

O preço mensal do plano PRIME (`price_1SxTFEPssGNUXxgnjmVW3vRd`) foi excluído no Stripe, mas as Edge Functions ainda referenciam esse ID inexistente.

## Análise Completa do Estado Atual

### Banco de Dados (OK)
| Plano | Preço | Usuários | WhatsApp | IA Convs | Áudio | Agentes |
|-------|-------|----------|----------|----------|-------|---------|
| PRIME | R$ 97,90 | 1 | 1 | 150 | 10 min | 1 |
| BASIC | R$ 197,00 | 2 | 1 | 200 | 10 min | 1 |
| STARTER | R$ 497,00 | 3 | 2 | 300 | 25 min | 2 |
| PROFESSIONAL | R$ 897,00 | 4 | 4 | 400 | 40 min | 4 |
| ENTERPRISE | R$ 1.297,00 | 8 | 6 | 1000 | 60 min | 10 |

### Stripe - Preços Atuais
| Produto | Price ID | Valor | Intervalo |
|---------|----------|-------|-----------|
| PRIME Anual | `price_1SxTGcPssGNUXxgnpCeUC2OV` | R$ 1.076,90 | Ano |
| PRIME Mensal | ❌ **EXCLUÍDO** | - | - |
| ENTERPRISE v2 | `price_1SxTGxPssGNUXxgnSxQdCPRA` | R$ 1.297,00 | Mês |
| ENTERPRISE v2 Anual | `price_1SxTHhPssGNUXxgnYdCD8656` | R$ 14.267,00 | Ano |

---

## Ação Necessária

### 1. Criar Novo Preço PRIME Mensal no Stripe

Criar um novo preço mensal associado ao produto PRIME existente (`prod_TvJu1ixAjk2lV6`):
- Valor: R$ 97,90 (9790 centavos)
- Intervalo: Mensal
- Produto: PRIME (existente)

### 2. Atualizar Edge Functions

Após obter o novo Price ID, atualizar os mapeamentos em:

**`supabase/functions/create-checkout-session/index.ts`** (linha 13):
```typescript
prime: {
  monthly: "NOVO_PRICE_ID_AQUI",  // Substituir ID excluído
  yearly: "price_1SxTGcPssGNUXxgnpCeUC2OV"
}
```

**`supabase/functions/generate-payment-link/index.ts`** (linha 20):
```typescript
"PRIME": {
  monthly: "NOVO_PRICE_ID_AQUI",  // Substituir ID excluído
  yearly: "price_1SxTGcPssGNUXxgnpCeUC2OV"
}
```

---

## Verificações Adicionais (Já OK)

| Item | Status |
|------|--------|
| `billing-config.ts` com `aiAgent: 19.00` | ✅ Implementado |
| `LandingPage.tsx` com Agente IA adicional | ✅ Implementado |
| `ImageViewerDialog.tsx` com foco automático | ✅ Implementado |
| Plano PRIME no banco de dados | ✅ Criado |
| Preço ENTERPRISE atualizado no banco | ✅ Atualizado |

---

## Sequência de Execução

```text
┌─────────────────────────────────────────────────────────────────┐
│ PASSO 1: Stripe                                                 │
│          → Criar novo preço PRIME mensal (R$ 97,90)             │
│          → Associar ao produto existente prod_TvJu1ixAjk2lV6    │
├─────────────────────────────────────────────────────────────────┤
│ PASSO 2: Edge Functions                                         │
│          → Atualizar create-checkout-session com novo ID        │
│          → Atualizar generate-payment-link com novo ID          │
├─────────────────────────────────────────────────────────────────┤
│ PASSO 3: Deploy                                                 │
│          → Deploy das Edge Functions atualizadas                │
├─────────────────────────────────────────────────────────────────┤
│ PASSO 4: Validação                                              │
│          → Testar checkout do plano PRIME mensal                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Resultado Esperado

Após correção, a tabela de preços do Stripe ficará:

| Plano | Mensal (Price ID) | Anual (Price ID) |
|-------|-------------------|------------------|
| PRIME | `NOVO_ID` | `price_1SxTGcPssGNUXxgnpCeUC2OV` |
| BASIC | `price_1SwDgnPssGNUXxgnH6kyepNO` | `price_1SwAujPssGNUXxgnEFJL0T6l` |
| STARTER | `price_1SwAvUPssGNUXxgnT3lrWG6S` | `price_1SwAwNPssGNUXxgnnMMSemHz` |
| PROFESSIONAL | `price_1SwAyyPssGNUXxgn8mzTO9gC` | `price_1SwAyyPssGNUXxgnNEbvcWuw` |
| ENTERPRISE | `price_1SxTGxPssGNUXxgnSxQdCPRA` | `price_1SxTHhPssGNUXxgnYdCD8656` |

