

# Correção: Sistema de Impersonation com URLs Mal-Formadas

## Análise do Problema

Após análise detalhada dos logs de rede, identifiquei **3 problemas críticos** na Edge Function `impersonate-user`:

### Problema 1: Encoding Triplo do company_name

**Código Atual (linha 118):**
```typescript
redirectUrl.searchParams.set("company_name", encodeURIComponent(companyName));
```

**Resultado na URL:**
```
company_name%3DPNH%252520IMPORTA%2525C3%252587...
```

O `searchParams.set()` **já faz encoding automático**. Usar `encodeURIComponent()` adicionalmente causa encoding duplo/triplo, resultando em:
- `%252520` ao invés de `%20` (espaço)
- `%2525C3%252587` ao invés de `%C3%87` (Ç)

### Problema 2: Parâmetros Duplicados na URL Final

**Código Atual (linhas 172-175):**
```typescript
const impersonationUrl = new URL(verificationUrl);
impersonationUrl.searchParams.set("impersonating", "true");
impersonationUrl.searchParams.set("admin_id", callerUserId);
impersonationUrl.searchParams.set("company_name", companyName);
```

A URL de verificação já contém `redirect_to` com os parâmetros. Adicionar os mesmos parâmetros **novamente** causa:
1. Duplicação (parâmetros aparecem 2x)
2. Confusão no Supabase Auth sobre qual valor usar
3. A URL final ficou com 650+ caracteres

### Problema 3: O redirect_to já está correto, não precisa modificar

O magic link da Supabase já lida com o `redirect_to` corretamente. Adicionar parâmetros extras na URL de verificação não é necessário e pode quebrar o fluxo.

---

## Evidência do Problema

**URL Retornada pela API:**
```
https://jiragtersejnarxruqyd.supabase.co/auth/v1/verify
  ?token=e2e53c7c...
  &type=magiclink
  &redirect_to=https%3A%2F%2Fid-preview--...%2Fdashboard
    %3Fimpersonating%3Dtrue
    %26admin_id%3D08103eb3...
    %26company_name%3DPNH%252520IMPORTA%2525C3%252587...  <- ENCODING ERRADO
  &impersonating=true                                     <- DUPLICADO
  &admin_id=08103eb3...                                   <- DUPLICADO  
  &company_name=PNH+IMPORTA%C3%87%C3%83O...               <- DUPLICADO
```

---

## Solução Proposta

### Edge Function: impersonate-user/index.ts

**Correção 1: Remover encodeURIComponent() redundante**

```typescript
// ANTES (linha 118):
redirectUrl.searchParams.set("company_name", encodeURIComponent(companyName));

// DEPOIS:
redirectUrl.searchParams.set("company_name", companyName);
```

**Correção 2: Não adicionar parâmetros extras na URL de verificação**

```typescript
// ANTES (linhas 167-176):
const verificationUrl = linkData.properties.action_link;
const impersonationUrl = new URL(verificationUrl);
impersonationUrl.searchParams.set("impersonating", "true");
impersonationUrl.searchParams.set("admin_id", callerUserId);
impersonationUrl.searchParams.set("company_name", companyName);

// DEPOIS:
// A URL de verificação já contém o redirect_to correto
// Não precisamos adicionar parâmetros extras
const verificationUrl = linkData.properties.action_link;
```

---

## Fluxo Correto Após Correção

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ FLUXO CORRIGIDO                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Edge Function gera redirect_to com parâmetros                          │
│     → redirect_to = /dashboard?impersonating=true&admin_id=X&company_name=Y │
│                                                                             │
│  2. Supabase Auth gera magic link com esse redirect_to                     │
│     → https://supabase.co/auth/v1/verify?token=...&redirect_to=...         │
│                                                                             │
│  3. Usuário clica no link, Supabase autentica                              │
│                                                                             │
│  4. Supabase redireciona para redirect_to original                         │
│     → /dashboard?impersonating=true&admin_id=X&company_name=Y              │
│                                                                             │
│  5. useImpersonation detecta os parâmetros, salva estado, limpa URL        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/impersonate-user/index.ts` | Remover encoding duplo e parâmetros duplicados |

---

## Código Corrigido

```typescript
// Linha 118: Remover encodeURIComponent
redirectUrl.searchParams.set("company_name", companyName);

// Linhas 167-180: Simplificar retorno
console.log("[impersonate-user] Success - Admin:", callerUserId, "impersonating:", targetProfile.email);

// A URL de verificação (action_link) já contém o redirect_to correto
// O Supabase Auth vai redirecionar o usuário para lá após verificação
const verificationUrl = linkData.properties.action_link;

return new Response(
  JSON.stringify({
    success: true,
    url: verificationUrl,  // Usar URL limpa, sem modificações
    target_user: {
      id: targetProfile.id,
      name: targetProfile.full_name,
      email: targetProfile.email,
    },
    company_name: companyName,
  }),
  { status: 200, headers: responseHeaders }
);
```

---

## Resultado Esperado

**URL Após Correção:**
```
https://jiragtersejnarxruqyd.supabase.co/auth/v1/verify
  ?token=e2e53c7c...
  &type=magiclink
  &redirect_to=https%3A%2F%2Fid-preview--...%2Fdashboard
    %3Fimpersonating%3Dtrue
    %26admin_id%3D08103eb3...
    %26company_name%3DPNH%2520IMPORTA%25C3%2587%25C3%2583O...
```

- Encoding correto (single)
- Sem parâmetros duplicados
- URL limpa e funcional

---

## Checklist de Validação

- [ ] Clicar "Acessar como Cliente" abre nova aba
- [ ] Nova aba redireciona para /dashboard do cliente
- [ ] Banner de impersonation aparece com nome da empresa correto
- [ ] Botão "Sair do modo Admin" funciona
- [ ] URL fica limpa após redirect (sem parâmetros de impersonation)

