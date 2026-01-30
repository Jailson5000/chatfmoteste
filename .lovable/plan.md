

# Correção: Superadmin Desconectado ao Fazer Impersonation

## Diagnóstico do Problema

### Fluxo Atual (Problemático)

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  FLUXO ATUAL - PROBLEMA                                                                  │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  1. Admin está em: id-preview--39ee3e91...lovable.app/global-admin/companies            │
│                                                                                          │
│  2. Clica "Acessar como Cliente" → Edge Function usa origin do request                  │
│     → redirect_to = id-preview--39ee3e91...lovable.app/dashboard                        │
│                                                                                          │
│  3. Magic link abre nova aba, autentica como cliente                                    │
│                                                                                          │
│  4. Redireciona para id-preview--39ee3e91...lovable.app/dashboard                       │
│                                                                                          │
│  5. ProtectedRoute verifica:                                                            │
│     - company_subdomain = "pndistribuidora" (do banco)                                  │
│     - currentSubdomain = null (está na preview URL, não no subdomain)                   │
│                                                                                          │
│  6. BLOQUEADO! → TenantMismatch: "Você deve acessar via pndistribuidora.miauchat..."   │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Evidência do Problema

**Dados do banco:**
- Empresa: `PNH IMPORTAÇÃO DISTRIBUIÇÃO E COMERCIO LTDA`
- Subdomain: `pndistribuidora`

**URL gerada pela Edge Function:**
```
redirect_to = https://id-preview--39ee3e91...lovable.app/dashboard
```

**URL que deveria ser gerada:**
```
redirect_to = https://pndistribuidora.miauchat.com.br/dashboard
```

### Causa Raiz

A Edge Function `impersonate-user` usa o `origin` do request do admin para gerar o redirect. Isso está errado porque:

- Em produção, o admin pode acessar de qualquer URL (global-admin, preview, etc.)
- O cliente precisa ser redirecionado para **seu próprio subdomain**
- O `ProtectedRoute` valida corretamente que cada usuário só pode acessar seu subdomain

---

## Solução

### Opção Escolhida: Gerar URL com Subdomain da Empresa

A Edge Function deve buscar o `subdomain` da empresa do target user e construir a URL correta.

### Modificação na Edge Function

**Arquivo:** `supabase/functions/impersonate-user/index.ts`

**Lógica Atual (linhas 100-118):**
```typescript
// 6. Get company name for logging
let companyName = "Unknown";
if (company_id) {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("name")
    .eq("id", company_id)
    .single();
  companyName = company?.name || "Unknown";
}

// 7. Generate a magic link for the target user
const appOrigin = origin || "https://chatfmoteste.lovable.app";
const redirectUrl = new URL("/dashboard", appOrigin);
```

**Lógica Corrigida:**
```typescript
// 6. Get company name AND subdomain for correct redirect
let companyName = "Unknown";
let targetSubdomain: string | null = null;

// First, try to get subdomain from target user's law_firm
const { data: targetLawFirm } = await supabaseAdmin
  .from("law_firms")
  .select("subdomain, name")
  .eq("id", targetProfile.law_firm_id)
  .single();

if (targetLawFirm?.subdomain) {
  targetSubdomain = targetLawFirm.subdomain;
}

// Get company name for logging/display
if (company_id) {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("name")
    .eq("id", company_id)
    .single();
  companyName = company?.name || targetLawFirm?.name || "Unknown";
} else {
  companyName = targetLawFirm?.name || "Unknown";
}

// 7. Generate a magic link for the target user
// Use the correct tenant subdomain if available
let appOrigin: string;

if (targetSubdomain) {
  // Production/Staging: Use tenant's subdomain
  appOrigin = `https://${targetSubdomain}.miauchat.com.br`;
} else if (origin?.includes('lovable.app') || origin?.includes('lovableproject.com')) {
  // Development/Preview: Use the request origin (for testing)
  appOrigin = origin;
} else {
  // Fallback for production main domain
  appOrigin = origin || "https://chatfmoteste.lovable.app";
}

const redirectUrl = new URL("/dashboard", appOrigin);
```

---

## Fluxo Corrigido

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  FLUXO CORRIGIDO                                                                         │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  1. Admin está em: id-preview--39ee3e91...lovable.app/global-admin/companies            │
│                                                                                          │
│  2. Clica "Acessar como Cliente"                                                        │
│     → Edge Function busca subdomain: "pndistribuidora"                                  │
│     → redirect_to = https://pndistribuidora.miauchat.com.br/dashboard                   │
│                                                                                          │
│  3. Magic link abre nova aba, autentica como cliente                                    │
│                                                                                          │
│  4. Redireciona para https://pndistribuidora.miauchat.com.br/dashboard                  │
│                                                                                          │
│  5. ProtectedRoute verifica:                                                            │
│     - company_subdomain = "pndistribuidora"                                             │
│     - currentSubdomain = "pndistribuidora" ✅ MATCH!                                    │
│                                                                                          │
│  6. PERMITIDO! → Dashboard carrega normalmente com banner de impersonation              │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Consideração para Ambiente de Preview

Para que funcione em ambiente de preview (Lovable development), precisamos de lógica especial:

```typescript
// Check if we're in development/preview environment
const isPreviewEnv = origin?.includes('lovable.app') || 
                     origin?.includes('lovableproject.com') ||
                     origin?.includes('localhost');

if (isPreviewEnv && !targetSubdomain) {
  // In preview without subdomain: use origin as fallback
  appOrigin = origin;
} else if (targetSubdomain) {
  // Has subdomain: always use production domain
  appOrigin = `https://${targetSubdomain}.miauchat.com.br`;
} else {
  // Fallback
  appOrigin = origin || "https://chatfmoteste.lovable.app";
}
```

---

## Arquivo a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `supabase/functions/impersonate-user/index.ts` | Buscar subdomain e gerar URL correta |

---

## Seção Técnica

### Query para Buscar Subdomain

```sql
SELECT subdomain, name 
FROM law_firms 
WHERE id = targetProfile.law_firm_id
```

### Lógica de Decisão de URL

```typescript
// Prioridade:
// 1. Se tem subdomain → usar subdomain.miauchat.com.br
// 2. Se está em preview sem subdomain → usar origin (para testes)
// 3. Fallback → domínio principal

function getTargetUrl(subdomain: string | null, origin: string | null): string {
  if (subdomain) {
    return `https://${subdomain}.miauchat.com.br`;
  }
  
  if (origin?.includes('lovable') || origin?.includes('localhost')) {
    return origin;
  }
  
  return 'https://chatfmoteste.lovable.app';
}
```

---

## Checklist de Validação

- [ ] Em produção: Admin clica "Acessar como Cliente"
- [ ] Nova aba abre em `https://[subdomain].miauchat.com.br/dashboard`
- [ ] Banner de impersonation aparece
- [ ] ProtectedRoute não bloqueia (subdomain correto)
- [ ] Em preview: Se empresa não tem subdomain, usa URL de preview
- [ ] Botão "Sair do modo Admin" funciona normalmente

