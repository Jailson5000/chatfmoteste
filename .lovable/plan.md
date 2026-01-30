
# Correção: Sistema de Impersonation - Problema de Redirect do Supabase Auth

## Diagnóstico Completo

### O Que Está Acontecendo

O sistema de impersonation falha por causa de uma **limitação do Supabase Auth**:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  FLUXO ATUAL - POR QUE FALHA                                                            │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  1. Edge Function gera:                                                                  │
│     redirect_to = https://pndistribuidora.miauchat.com.br/dashboard ✓                   │
│                                                                                          │
│  2. Supabase Auth recebe o redirect_to                                                  │
│                                                                                          │
│  3. Supabase Auth verifica "Redirect URLs" configuradas no Dashboard                    │
│     → Configuração atual: https://app.miauchat.com.br                                   │
│     → pndistribuidora.miauchat.com.br NÃO está na lista                                │
│                                                                                          │
│  4. Supabase Auth IGNORA redirect_to e usa Site URL padrão:                            │
│     → Redireciona para https://app.miauchat.com.br/dashboard                           │
│                                                                                          │
│  5. ProtectedRoute detecta:                                                              │
│     - currentSubdomain = null (app é reservado = main domain)                          │
│     - company_subdomain = "pndistribuidora"                                            │
│     - isMainDomain = true                                                              │
│                                                                                          │
│  6. BLOQUEADO → TenantMismatch                                                          │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Evidência na Screenshot

- URL: `app.miauchat.com.br/dashboard`
- Erro: "Subdomínio atual: Domínio principal"
- Esperado: `pndistribuidora.miauchat.com.br`

---

## Opções de Solução

### Opção A: Configurar Wildcard no Supabase Auth (RECOMENDADO)
**Requisito:** Adicionar `https://*.miauchat.com.br/**` nas Redirect URLs do Supabase Dashboard

**Prós:** Solução definitiva, funciona para todos os tenants
**Contras:** Requer acesso ao Supabase Dashboard

### Opção B: Bypass do Redirect + Navegação Manual (ALTERNATIVA)
Em vez de depender do redirect do magic link, fazer:
1. Autenticar no domínio principal
2. Navegar manualmente para o subdomain correto após autenticação
3. Usar token existente

**Prós:** Não depende de configuração externa
**Contras:** Fluxo mais complexo, pode ter problemas de cookies cross-domain

### Opção C: Remover Funcionalidade (ÚLTIMO RECURSO)
Se não conseguirmos resolver, reverter para o estado anterior sem impersonation.

---

## Solução Recomendada: Opção A + Fallback

### Passo 1: Configuração do Supabase Auth (Ação Manual Necessária)

O usuário (ou administrador) precisa acessar o Supabase Dashboard e adicionar:

**Configuração → Authentication → URL Configuration:**

1. **Site URL:** `https://miauchat.com.br` (domínio principal)

2. **Redirect URLs:** Adicionar padrão wildcard:
   ```
   https://*.miauchat.com.br/**
   ```
   
   Ou listar explicitamente:
   ```
   https://pndistribuidora.miauchat.com.br/**
   https://app.miauchat.com.br/**
   https://miauchat.com.br/**
   ```

### Passo 2: Adicionar Bypass para Impersonation no ProtectedRoute

Enquanto a configuração não é feita, podemos adicionar uma exceção temporária no `ProtectedRoute` que detecta quando é uma sessão de impersonation e permite acesso, redirecionando o usuário para o subdomain correto via JavaScript:

```typescript
// Em ProtectedRoute.tsx - Detectar impersonation e redirecionar

// Verificar se há parâmetros de impersonation na URL
const searchParams = new URLSearchParams(window.location.search);
const isImpersonating = searchParams.get('impersonating') === 'true';

// Se está em impersonation no domínio errado, redirecionar manualmente
if (isImpersonating && company_subdomain && isMainDomain) {
  const correctUrl = `https://${company_subdomain}.miauchat.com.br/dashboard${window.location.search}`;
  window.location.href = correctUrl;
  return <LoadingScreen message="Redirecionando para sua plataforma..." />;
}
```

### Passo 3: Melhorar Hook useImpersonation

Adicionar lógica que, após autenticação bem-sucedida em qualquer domínio, redireciona automaticamente para o subdomain correto do usuário logado.

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/components/auth/ProtectedRoute.tsx` | Adicionar detecção de impersonation e redirect automático |
| `src/hooks/useImpersonation.tsx` | Melhorar detecção cross-domain |

---

## Código da Correção

### ProtectedRoute.tsx - Adicionar Redirect de Impersonation

```typescript
// Após linha 30 (useTenant), adicionar:

// IMPERSONATION HANDLING: Detect cross-domain impersonation and redirect
useEffect(() => {
  if (user && company_subdomain && isMainDomain) {
    const searchParams = new URLSearchParams(window.location.search);
    const isImpersonating = searchParams.get('impersonating') === 'true';
    
    if (isImpersonating) {
      // User was authenticated but landed on wrong domain
      // Redirect to correct subdomain with preserved params
      const correctUrl = `https://${company_subdomain}.miauchat.com.br${window.location.pathname}${window.location.search}`;
      console.log('[ProtectedRoute] Impersonation redirect to:', correctUrl);
      window.location.href = correctUrl;
    }
  }
}, [user, company_subdomain, isMainDomain]);
```

---

## Fluxo Corrigido

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  FLUXO CORRIGIDO                                                                         │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  1. Edge Function gera redirect_to = pndistribuidora.miauchat.com.br ✓                  │
│                                                                                          │
│  2. Supabase Auth redireciona para app.miauchat.com.br (fallback)                       │
│                                                                                          │
│  3. ProtectedRoute detecta:                                                              │
│     - isImpersonating = true (parâmetro na URL)                                         │
│     - company_subdomain = "pndistribuidora"                                             │
│     - isMainDomain = true                                                               │
│                                                                                          │
│  4. ProtectedRoute redireciona via JavaScript:                                           │
│     → window.location.href = "https://pndistribuidora.miauchat.com.br/dashboard?..."   │
│                                                                                          │
│  5. Nova página carrega no subdomain correto                                            │
│     - Sessão Supabase persiste (mesmo projeto)                                          │
│     - company_subdomain = currentSubdomain = "pndistribuidora" ✓                        │
│                                                                                          │
│  6. PERMITIDO → Dashboard carrega normalmente                                           │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Importante: Sessão Compartilhada

O Supabase Auth usa cookies/localStorage baseados no domínio pai (`.miauchat.com.br`). Isso significa que a sessão autenticada em `app.miauchat.com.br` **é válida** em `pndistribuidora.miauchat.com.br` porque:

1. Ambos são subdomínios de `miauchat.com.br`
2. O Supabase project é o mesmo
3. Os tokens JWT funcionam em qualquer subdomain

---

## Checklist de Validação

- [ ] Admin clica "Acessar como Cliente"
- [ ] Magic link abre (pode ir para app.miauchat.com.br)
- [ ] ProtectedRoute detecta impersonation + wrong domain
- [ ] Redirect automático para pndistribuidora.miauchat.com.br
- [ ] Dashboard carrega com banner de impersonation
- [ ] Sessão funciona normalmente
