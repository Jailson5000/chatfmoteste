
# Sincronização de Planos: Global Admin → Landing Page

## Problema Principal

A Landing Page exibe apenas a lista `features` dos planos do banco de dados, mas essa lista **não inclui o número de usuários** de cada plano. Além disso, há valores de fallback desatualizados no código.

---

## Diagnóstico Detalhado

### 1. Features do Banco vs. O Que Deveria Aparecer

| Plano | Features Atuais (Banco) | Informação Faltando |
|-------|-------------------------|---------------------|
| BASIC | 200 conversas, 10 min áudio, 1 WA, 1 agente... | **2 usuários** |
| STARTER | 300 conversas, 25 min áudio, 2 WA, 2 agentes... | **3 usuários** |
| PROFESSIONAL | 400 conversas, 40 min áudio, 4 WA, 4 agentes... | **4 usuários** |
| ENTERPRISE | 1000 conversas, 60 min áudio, 6 WA, 10 agentes... | **8 usuários** |

### 2. GlobalAdminCompanies - Fallbacks Incorretos

**Arquivo:** `src/pages/global-admin/GlobalAdminCompanies.tsx`  
**Linhas 257-258:**

| Campo | Fallback Atual | Fallback Correto (BASIC) |
|-------|----------------|--------------------------|
| max_ai_conversations | 250 | **200** |
| max_tts_minutes | 40 | **10** |

---

## Solução Proposta

### Correção 1: Atualizar Features no Banco de Dados

Adicionar o número de usuários como primeiro item de cada lista `features`:

```sql
-- BASIC: Adicionar "2 usuários"
UPDATE plans SET features = ARRAY[
  '2 usuários',
  '200 conversas com IA',
  '10 minutos de áudio',
  '1 WhatsApp conectado',
  '1 agente de IA',
  'Automação essencial',
  'Mensagens rápidas',
  'Respostas automáticas'
] WHERE UPPER(name) = 'BASIC';

-- STARTER: Adicionar "3 usuários"
UPDATE plans SET features = ARRAY[
  '3 usuários',
  '300 conversas com IA',
  '25 minutos de áudio',
  '2 WhatsApps conectados',
  '2 agentes de IA',
  'Tudo do plano Basic',
  'Transcrição de áudio e imagens',
  'Mensagens agendadas'
] WHERE UPPER(name) = 'STARTER';

-- PROFESSIONAL: Adicionar "4 usuários"
UPDATE plans SET features = ARRAY[
  '4 usuários',
  '400 conversas com IA',
  '40 minutos de áudio',
  '4 WhatsApps conectados',
  '4 agentes de IA',
  'Tudo do plano Starter',
  'IA avançada para conversação',
  'Maior capacidade operacional'
] WHERE UPPER(name) = 'PROFESSIONAL';

-- ENTERPRISE: Adicionar "8 usuários"
UPDATE plans SET features = ARRAY[
  '8 usuários',
  '1000 conversas com IA',
  '60 minutos de áudio',
  '6 WhatsApps conectados',
  '10 agentes de IA',
  'Onboarding assistido',
  'SLA e suporte prioritário',
  'Modelo flexível de consumo'
] WHERE UPPER(name) = 'ENTERPRISE';
```

---

### Correção 2: Atualizar Fallbacks no GlobalAdminCompanies

**Arquivo:** `src/pages/global-admin/GlobalAdminCompanies.tsx`

**Linha 257-258 - Função handlePlanSelect:**

```typescript
// ANTES
max_ai_conversations: selectedPlan.max_ai_conversations ?? 250,
max_tts_minutes: selectedPlan.max_tts_minutes ?? 40,

// DEPOIS
max_ai_conversations: selectedPlan.max_ai_conversations ?? 200,
max_tts_minutes: selectedPlan.max_tts_minutes ?? 10,
```

---

## Resumo das Alterações

| Local | Tipo | Alteração |
|-------|------|-----------|
| Banco `plans` (BASIC) | SQL | Adicionar "2 usuários" às features |
| Banco `plans` (STARTER) | SQL | Adicionar "3 usuários" às features |
| Banco `plans` (PROFESSIONAL) | SQL | Adicionar "4 usuários" às features |
| Banco `plans` (ENTERPRISE) | SQL | Adicionar "8 usuários" às features |
| `GlobalAdminCompanies.tsx` | Frontend | Corrigir fallbacks para valores BASIC |

---

## Resultado Esperado

### Landing Page - Antes vs Depois

**Antes (PROFESSIONAL):**
- 400 conversas com IA
- 40 minutos de áudio
- 4 WhatsApps conectados
- 4 agentes de IA
- ...

**Depois (PROFESSIONAL):**
- **4 usuários** ← NOVO
- 400 conversas com IA
- 40 minutos de áudio
- 4 WhatsApps conectados
- 4 agentes de IA
- ...

---

## Fluxo de Dados

```text
Global Admin Plans → Salva no banco "plans" 
                         ↓
                    features: ["X usuários", "Y conversas", ...]
                         ↓
Landing Page → Busca plans via Supabase → Exibe features[]
                         ↓
                    ✓ Mostra todos os limites incluindo usuários
```
