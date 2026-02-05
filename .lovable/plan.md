

# Plano de Implementação: Novo Plano PRIME + Alterações de Preços

## Resumo das Alterações Solicitadas

| Item | Detalhe |
|------|---------|
| **1. ESC no ImageViewer** | Adicionar foco automático para tecla ESC funcionar |
| **2. Novo Plano PRIME** | 1 usuário, 150 conversas IA, 10 min áudio, 1 WhatsApp, 1 Agente |
| **3. Preço PRIME** | R$ 97,90/mês |
| **4. Alterar ENTERPRISE** | R$ 1.697,00 → R$ 1.297,00 |
| **5. Adicional Agente IA** | R$ 19,00/mês |

---

## Análise Detalhada

### 1. ESC no ImageViewer

**Status Atual**: O código já tem `handleKeyDown` com suporte a ESC (linha 101-104), mas o `<div>` precisa receber foco automaticamente para capturar as teclas.

**Problema**: O componente espera que o usuário clique na área antes de teclas funcionarem.

**Solução**: Adicionar `autoFocus` ou `useEffect` para focar automaticamente quando abre.

---

### 2. Novo Plano PRIME no Banco de Dados

**Tabela `plans` - Inserir novo registro:**

```text
┌────────────────────────────────────────────────────────────────┐
│ PLANO PRIME                                                    │
├────────────────────────────────────────────────────────────────┤
│ name: "PRIME"                                                  │
│ price: 97.90                                                   │
│ max_users: 1                                                   │
│ max_instances: 1                                               │
│ max_ai_conversations: 150                                      │
│ max_tts_minutes: 10                                            │
│ max_agents: 1                                                  │
│ max_workspaces: 1                                              │
│ features:                                                      │
│   - "1 usuário"                                                │
│   - "150 conversas com IA"                                     │
│   - "10 minutos de áudio"                                      │
│   - "1 WhatsApp conectado"                                     │
│   - "1 agente de IA"                                           │
│   - "Automação essencial"                                      │
│   - "Ideal para profissionais solo"                            │
└────────────────────────────────────────────────────────────────┘
```

---

### 3. Atualizar Preço do ENTERPRISE

**De**: R$ 1.697,00
**Para**: R$ 1.297,00

**Update no banco de dados:**
```sql
UPDATE plans SET price = 1297.00 WHERE name = 'ENTERPRISE';
```

---

### 4. Adicional Agente IA no billing-config.ts

**Arquivo**: `src/lib/billing-config.ts`

Adicionar ao `ADDITIONAL_PRICING`:
```typescript
export const ADDITIONAL_PRICING = {
  whatsappInstance: 57.90,
  user: 29.90,
  aiConversation: 0.27,
  ttsMinute: 0.97,
  aiAgent: 19.00,  // ← NOVO
} as const;
```

E atualizar interfaces e cálculos para incluir agentes no custo.

---

### 5. Atualizar Landing Page

O componente `additionalPricing` na landing page precisa incluir:
```typescript
{ item: "Agente de IA adicional", price: "R$ 19,00 / mês" },
```

---

### 6. Criar Produtos/Preços no Stripe

**PRIME** - Precisa criar no Stripe:
- Produto: "PRIME"
- Preço mensal: R$ 97,90 (9790 centavos)
- Preço anual: R$ 1.076,90 (11 meses)

**ENTERPRISE** - Atualizar preço:
- Criar NOVO price no Stripe: R$ 1.297,00/mês (129700 centavos)
- Criar NOVO price anual: R$ 14.267,00/ano (11 meses)
- **NÃO** deletar preços antigos (assinaturas existentes usam)

---

### 7. Atualizar Edge Functions

**Arquivos a modificar:**

1. `supabase/functions/create-checkout-session/index.ts`
   - Adicionar mapeamento `prime`
   - Atualizar price IDs do `enterprise`

2. `supabase/functions/generate-payment-link/index.ts`
   - Adicionar mapeamento `PRIME`
   - Atualizar price IDs do `ENTERPRISE`

---

## Ordem de Execução (Sequência Segura)

```text
┌─────────────────────────────────────────────────────────────────┐
│ PASSO 1: Stripe - Criar produtos e preços                      │
│          → Produto PRIME + preços mensal/anual                  │
│          → Novos preços ENTERPRISE (R$ 1.297)                   │
├─────────────────────────────────────────────────────────────────┤
│ PASSO 2: Banco de dados                                         │
│          → INSERT plano PRIME                                   │
│          → UPDATE preço ENTERPRISE                              │
├─────────────────────────────────────────────────────────────────┤
│ PASSO 3: Código Frontend                                        │
│          → ImageViewerDialog (foco automático ESC)              │
│          → billing-config.ts (adicional agente IA)              │
│          → LandingPage.tsx (adicional na tabela)                │
├─────────────────────────────────────────────────────────────────┤
│ PASSO 4: Edge Functions                                         │
│          → create-checkout-session (PRIME + Enterprise IDs)     │
│          → generate-payment-link (PRIME + Enterprise IDs)       │
├─────────────────────────────────────────────────────────────────┤
│ PASSO 5: Validação                                              │
│          → Landing page exibe planos corretamente               │
│          → Checkout funciona para todos os planos               │
│          → ESC fecha imagem                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Risco e Mitigação

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Checkout falha para PRIME | Baixa | Testar antes de publicar |
| Preços Enterprise antigos | Nenhum | Assinaturas existentes mantêm preço antigo |
| Landing não exibe PRIME | Baixa | Planos são carregados do banco dinamicamente |
| ESC não funciona | Baixa | Usar ref + useEffect para garantir foco |

---

## Arquivos a Modificar

| Arquivo | Tipo de Mudança |
|---------|-----------------|
| `src/components/conversations/ImageViewerDialog.tsx` | Adicionar useRef + useEffect para foco |
| `src/lib/billing-config.ts` | Adicionar `aiAgent: 19.00` + cálculos |
| `src/pages/landing/LandingPage.tsx` | Adicionar linha de adicional Agente IA |
| `supabase/functions/create-checkout-session/index.ts` | Adicionar PRIME, atualizar ENTERPRISE IDs |
| `supabase/functions/generate-payment-link/index.ts` | Adicionar PRIME, atualizar ENTERPRISE IDs |

---

## Operações no Stripe (Via Ferramenta)

1. **Criar Produto PRIME**
2. **Criar Preço PRIME mensal** (R$ 97,90)
3. **Criar Preço PRIME anual** (R$ 1.076,90)
4. **Criar Preço ENTERPRISE mensal novo** (R$ 1.297,00)
5. **Criar Preço ENTERPRISE anual novo** (R$ 14.267,00)

---

## Dados do Banco de Dados

**INSERT plano PRIME:**
```sql
INSERT INTO plans (
  name, description, price, billing_period,
  max_users, max_instances, max_messages,
  max_ai_conversations, max_tts_minutes, max_agents, max_workspaces,
  features, is_active
) VALUES (
  'PRIME', 'Plano ideal para profissionais solo', 97.90, 'monthly',
  1, 1, 0, 150, 10, 1, 1,
  ARRAY['1 usuário', '150 conversas com IA', '10 minutos de áudio', '1 WhatsApp conectado', '1 agente de IA', 'Automação essencial', 'Ideal para profissionais solo'],
  true
);
```

**UPDATE preço ENTERPRISE:**
```sql
UPDATE plans SET price = 1297.00 WHERE name = 'ENTERPRISE';
```

---

## Resultado Esperado

Após implementação:

| Plano | Preço Mensal | Usuários | WhatsApp | Conversas IA | Áudio | Agentes |
|-------|-------------|----------|----------|--------------|-------|---------|
| **PRIME** | R$ 97,90 | 1 | 1 | 150 | 10 min | 1 |
| BASIC | R$ 197,00 | 2 | 1 | 200 | 10 min | 1 |
| STARTER | R$ 497,00 | 3 | 2 | 300 | 25 min | 2 |
| PROFESSIONAL | R$ 897,00 | 4 | 4 | 400 | 40 min | 4 |
| **ENTERPRISE** | **R$ 1.297,00** | 8 | 6 | 1000 | 60 min | 10 |

**Adicionais:**
| Item | Preço |
|------|-------|
| WhatsApp adicional | R$ 57,90/mês |
| Usuário adicional | R$ 29,90/mês |
| **Agente IA adicional** | **R$ 19,00/mês** |
| Conversa IA adicional | R$ 0,27/conv |
| Minuto áudio adicional | R$ 0,97/min |

