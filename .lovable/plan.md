
# Plano de Correção: Sistema Travando na Verificação de Acesso

## Problema Identificado

O sistema está travando na tela "Verificando acesso..." porque a função `extractSubdomain()` no hook `useTenant.tsx` não reconhece os domínios de preview do Lovable (`.lovable.app`, `.lovableproject.com`) como domínios principais.

### O que está acontecendo

1. Quando o app é acessado pelo preview do Lovable (ex: `id-preview--39ee3e91-be33-4c6a-91f1-0c6513b5b19e.lovable.app`), a função de extração de subdomínio interpreta o prefixo como um subdomínio de cliente
2. O sistema tenta buscar esse "subdomínio" no banco de dados (`law_firms WHERE subdomain = 'id-preview--39ee3e91-...'`)
3. Não encontra, e define `error = "Empresa não encontrada"`
4. O `ProtectedRoute` continua em `tenantLoading = false` mas com erro, porém a lógica não trata esse caso adequadamente

### Impacto

- Todos os acessos pelo preview do Lovable ficam travados
- Tanto o Global Admin quanto rotas protegidas normais são afetadas

---

## Correção Proposta

### Arquivo: `src/hooks/useTenant.tsx`

Adicionar domínios Lovable à lista de domínios principais que devem ser ignorados na extração de subdomínio:

```typescript
// Linha ~49-57 - Adicionar domínios Lovable
const MAIN_DOMAINS = [
  'miauchat.com.br',
  'www.miauchat.com.br',
  'staging.miauchat.com.br',
  'localhost',
  // White-label public subdomains (treated as main domain)
  'agendar.miauchat.com.br',
  'widget.miauchat.com.br',
];

// ADICIONAR: Lista de sufixos de domínios de preview/desenvolvimento
const PREVIEW_DOMAIN_SUFFIXES = [
  '.lovable.app',
  '.lovableproject.com',
  '.lovable.dev',
  '.vercel.app',
  '.netlify.app',
];
```

E modificar a função `extractSubdomain()`:

```typescript
export function extractSubdomain(hostname: string): string | null {
  const host = hostname.split(':')[0];
  
  // Localhost - desenvolvimento
  if (host === 'localhost') {
    return null;
  }
  
  // Domínios principais conhecidos
  if (MAIN_DOMAINS.includes(host)) {
    return null;
  }
  
  // NOVO: Verificar se é um domínio de preview/desenvolvimento
  // Estes não são domínios de clientes, são ambientes de preview
  for (const suffix of PREVIEW_DOMAIN_SUFFIXES) {
    if (host.endsWith(suffix)) {
      console.log('[useTenant] Preview domain detected, skipping subdomain extraction:', host);
      return null;
    }
  }
  
  // ... resto da lógica existente
}
```

---

## Fluxo Corrigido

```text
ANTES:
  URL: id-preview--XXX.lovable.app
  → extractSubdomain() retorna "id-preview--XXX"
  → Busca law_firm WHERE subdomain = "id-preview--XXX"
  → Não encontra → error = "Empresa não encontrada"
  → Tela trava ou exibe erro

DEPOIS:
  URL: id-preview--XXX.lovable.app
  → extractSubdomain() detecta ".lovable.app"
  → Retorna null (domínio de preview)
  → isMainDomain = true
  → ProtectedRoute continua normalmente
  → Acesso liberado
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/hooks/useTenant.tsx` | Adicionar lista de sufixos de preview e verificar antes de extrair subdomínio |

---

## Impacto

| Aspecto | Status |
|---------|--------|
| Produção (miauchat.com.br) | Não afetado - funciona como antes |
| Preview Lovable | Corrigido - não tenta extrair subdomínio |
| Global Admin | Corrigido - acesso liberado |
| Rotas protegidas | Corrigido - continua funcionando |
| Outras funcionalidades | Sem impacto |

---

## Segurança

Esta correção é segura porque:
- Domínios de preview nunca devem ser tratados como subdomínios de clientes
- A lógica de proteção por tenant continua funcionando em produção
- Não afeta o isolamento multi-tenant em ambiente de produção
