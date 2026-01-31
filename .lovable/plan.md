
# Correção de Planos Desatualizados

## Problemas Encontrados

### 1. Banco de Dados - Features dos Planos Incorretas
A coluna `features` (lista de recursos exibidos na Landing Page) está desatualizada:

| Plano | Problema |
|-------|----------|
| PROFESSIONAL | Falta "400 conversas com IA" na lista |
| ENTERPRISE | Mostra "600 conversas com IA" mas deveria ser "1000 conversas com IA" |

### 2. GlobalAdminCompanies - Defaults Hardcoded
Os valores padrão do formulário estão fixos em valores antigos (5 usuários, 2 conexões), quando deveriam refletir os limites do plano.

---

## Alterações Necessárias

### Correção 1: Atualizar Features no Banco de Dados

**Executar SQL para atualizar a coluna `features`:**

**PROFESSIONAL** - Adicionar "400 conversas com IA":
```sql
UPDATE plans SET features = ARRAY[
  '400 conversas com IA',
  '40 minutos de áudio',
  '4 WhatsApps conectados',
  '4 agentes de IA',
  'Tudo do plano Starter',
  'IA avançada para conversação',
  'Maior capacidade operacional'
] WHERE UPPER(name) = 'PROFESSIONAL';
```

**ENTERPRISE** - Corrigir de 600 para 1000:
```sql
UPDATE plans SET features = ARRAY[
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

### Correção 2: GlobalAdminCompanies.tsx

**Arquivo:** `src/pages/global-admin/GlobalAdminCompanies.tsx`

**Problema:** Os valores padrão em `resetFormData()` e estado inicial usam valores hardcoded antigos.

**Solução:** Ajustar os defaults para valores mínimos seguros (serão sobrescritos pelo plano selecionado):

| Campo | Antes | Depois |
|-------|-------|--------|
| max_users | 5 | 2 (mínimo BASIC) |
| max_instances | 2 | 1 (mínimo BASIC) |
| max_ai_conversations | 250 | 200 (mínimo BASIC) |
| max_tts_minutes | 40 | 10 (mínimo BASIC) |

**Linhas afetadas:**
- Linhas 233-238: Estado inicial `formData`
- Linhas 312-325: Função `resetFormData()`

---

## Resumo das Alterações

| Local | Tipo | Ação |
|-------|------|------|
| Banco `plans` (PROFESSIONAL) | SQL | Adicionar "400 conversas com IA" às features |
| Banco `plans` (ENTERPRISE) | SQL | Corrigir "600" para "1000 conversas com IA" |
| `GlobalAdminCompanies.tsx` | Frontend | Ajustar defaults para valores BASIC |

---

## Fluxo Após Correções

```text
Landing Page → Busca plans.features do banco → Exibe lista atualizada
     ↓
 ✓ PROFESSIONAL mostra "400 conversas com IA"
 ✓ ENTERPRISE mostra "1000 conversas com IA"

Admin Empresas → Seleciona plano → Limites preenchidos do plano
     ↓
 ✓ PROFESSIONAL preenche: 4 usuários, 4 conexões, 400 conversas
 ✓ Defaults seguros caso nenhum plano selecionado
```
