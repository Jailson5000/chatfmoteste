

# Plano: Corrigir Card de Onboarding que Desaparece

## Diagnóstico

### Problema Encontrado
O card de progresso do onboarding desaparece quando o cliente completa todas as etapas devido a uma **condição de renderização no Dashboard**:

```tsx
// Dashboard.tsx - linha 373
{!onboardingComplete && (
  <OnboardingProgressCard ... />
)}
```

### Por que "pisca e some"
1. Ao atualizar a página, os dados ainda não carregaram
2. `isComplete` começa como `false` (padrão)
3. Card aparece momentaneamente
4. Dados carregam do banco, `isComplete` vira `true`
5. Card desaparece

---

## Solução

### 1. Remover condição no Dashboard

**Arquivo:** `src/pages/Dashboard.tsx`

| Linha | Antes | Depois |
|-------|-------|--------|
| 373-379 | `{!onboardingComplete && (<OnboardingProgressCard .../>)}` | `<OnboardingProgressCard ... />` (sempre renderiza) |

O card **sempre** será renderizado, independente do progresso. O próprio `OnboardingProgressCard` já sabe como se exibir quando completo (versão compacta).

### 2. Evitar Flash Durante Loading

**Arquivo:** `src/pages/Dashboard.tsx`

Adicionar verificação de `isLoading` para não mostrar o card antes dos dados carregarem:

```tsx
// Adicionar isLoading ao destructuring
const { 
  progress: onboardingProgress, 
  completedCount, 
  totalCount, 
  isComplete: onboardingComplete,
  isLoading: onboardingLoading  // Adicionar
} = useOnboarding();

// Renderizar com verificação de loading
{!onboardingLoading && (
  <OnboardingProgressCard
    progress={onboardingProgress}
    completedSteps={completedCount}
    totalSteps={totalCount}
  />
)}
```

Dessa forma:
- Card não aparece durante o carregamento (evita o "flash")
- Card sempre aparece após carregar (mesmo quando 100%)
- Versão compacta é exibida quando completo

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Dashboard.tsx` | Remover `!onboardingComplete`, adicionar `!onboardingLoading` |

---

## Código Final

```tsx
// Dashboard.tsx - linhas 93-95
const { 
  progress: onboardingProgress, 
  completedCount, 
  totalCount, 
  isComplete: onboardingComplete,
  isLoading: onboardingLoading  // Adicionar isLoading
} = useOnboarding();

// Dashboard.tsx - linhas 371-380
<div className="p-6 space-y-6 bg-background min-h-screen">
  {/* Onboarding Progress Card - Sempre visível após carregar */}
  {!onboardingLoading && (
    <OnboardingProgressCard
      progress={onboardingProgress}
      completedSteps={completedCount}
      totalSteps={totalCount}
    />
  )}
  ...
```

---

## Fluxo Corrigido

```text
1. Usuário abre Dashboard
   ↓
2. isLoading = true → Card não aparece (sem flash)
   ↓
3. Dados carregam → isLoading = false
   ↓
4. progress < 100% → Card normal com barra de progresso
   OU
   progress = 100% → Card compacto "✓ Completo" + "Ver guia"
   ↓
5. Card SEMPRE visível para o cliente acessar o guia
```

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Progresso < 100% | ✅ Card aparece | ✅ Card aparece |
| Progresso = 100% | ❌ Card some | ✅ Card compacto aparece |
| Durante loading | ⚡ Flash | ✅ Nada (aguarda carregar) |
| Após atualizar página | ⚡ Pisca e some | ✅ Aparece estável |

