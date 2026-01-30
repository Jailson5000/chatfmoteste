
# Plano: Corrigir Classificação de Trial para PNH e no Fluxo de Registro

## Problema Identificado

A empresa **PNH IMPORTAÇÃO DISTRIBUIÇÃO E COMERCIO LTDA** não aparece como "Em Trial" no painel de admin global.

### Dados Atuais no Banco
| Campo | Valor | Correto? |
|-------|-------|----------|
| `trial_type` | `none` | ❌ Deveria ser `auto_plan` |
| `trial_started_at` | `null` | ❌ Deveria ter a data de criação |
| `trial_ends_at` | `2026-02-06` | ✅ Correto (7 dias após criação) |

### Lógica de Classificação no Sistema

O sistema verifica se uma empresa está em trial com esta condição:
```typescript
company.trial_type !== 'none' && company.trial_ends_at
```

Como `trial_type = 'none'`, a empresa não é classificada como trial, mesmo tendo `trial_ends_at` definido.

### Causa Raiz

No arquivo `register-company/index.ts` (linhas 294-311), quando a empresa é criada com auto-aprovação de trial, **faltam os campos `trial_type` e `trial_started_at`**:

```typescript
.insert({
  // ... outros campos
  trial_ends_at: trialEndsAt,    // ✅ Está sendo definido
  // ❌ FALTA: trial_type: 'auto_plan'
  // ❌ FALTA: trial_started_at: new Date().toISOString()
})
```

## Solução

### Parte 1: Correção Imediata para PNH

Atualizar os campos da empresa no banco de dados:

```sql
UPDATE companies 
SET 
  trial_type = 'auto_plan',
  trial_started_at = '2026-01-30T13:49:36.679735Z'  -- Usar created_at como base
WHERE id = 'e2fc7ac0-8b14-4ba5-968b-7d9d87bb57ef';
```

### Parte 2: Correção Estrutural no Código

Modificar `register-company/index.ts` para incluir os campos de trial corretamente.

**Antes:**
```typescript
.insert({
  name: company_name,
  // ...
  trial_ends_at: trialEndsAt,
  // ...
})
```

**Depois:**
```typescript
.insert({
  name: company_name,
  // ...
  trial_type: shouldAutoApprove ? 'auto_plan' : 'none',
  trial_started_at: shouldAutoApprove ? new Date().toISOString() : null,
  trial_ends_at: trialEndsAt,
  // ...
})
```

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/register-company/index.ts` | Adicionar `trial_type` e `trial_started_at` na criação |

## Resultado Esperado

Após as correções:
1. **PNH** aparecerá com badge "Em Trial" com dias restantes
2. **Futuros cadastros** via trial serão corretamente classificados
3. **Dashboard** contabilizará corretamente empresas em trial

## Impacto no Sistema

```text
┌─────────────────────────────────────────────────────────────────┐
│ LOCAIS QUE USAM trial_type !== 'none'                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ✓ GlobalAdminCompanies.tsx - Badge de trial                   │
│ ✓ CompanyUsageTable.tsx - Filtro de trial                     │
│ ✓ useSystemMetrics.tsx - Contador de trials                   │
│ ✓ ProtectedRoute.tsx - Bloqueio de trial expirado             │
│                                                                 │
│ Todos passarão a reconhecer PNH como trial corretamente       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Checklist de Validação

- [ ] PNH aparece com badge "Em Trial" no Global Admin
- [ ] Contador de trials no Dashboard atualizado
- [ ] Filtro "Em Trial" inclui PNH na listagem
- [ ] Novo cadastro trial define `trial_type = 'auto_plan'`
- [ ] Novo cadastro trial define `trial_started_at`
