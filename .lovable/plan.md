

# Corrigir erro de redirect_uri no Instagram Business Login

## Diagnostico

Os logs mostram repetidamente:
```
Error validating verification code. Please make sure your redirect_uri is identical to the one you used in the OAuth dialog request
```

O Instagram exige que o `redirect_uri` na troca do token seja **identico** ao usado na URL de autorizacao. O problema pode ser:

1. **Mismatch de dominio**: O usuario esta em `suporte.miauchat.com.br`, mas o `redirect_uri` no OAuth aponta para `https://miauchat.com.br/auth/meta-callback`. Se `miauchat.com.br` redireciona para outro dominio antes de carregar a pagina de callback, o `redirect_uri` enviado ao backend pode nao bater.

2. **URI nao salva corretamente no Meta Dashboard**: A URI registrada no Instagram Business Login settings pode ter diferenca sutil (trailing slash, www, etc.).

## Solucao

### 1. Backend: Adicionar logging de debug

Antes de tentar trocar o token, logar o `redirect_uri` exato que esta sendo enviado para comparar com o usado na URL de autorizacao.

### 2. Backend: Garantir consistencia

O `redirect_uri` hardcoded no backend deve ser exatamente `https://miauchat.com.br/auth/meta-callback` (sem trailing slash, sem www), identico ao usado no frontend pelo `getFixedRedirectUri("instagram")`.

### 3. Verificacao no Meta Dashboard

Na configuracao do **Instagram Business Login**, a URI de redirecionamento deve ser exatamente:
```
https://miauchat.com.br/auth/meta-callback
```
- Sem barra final
- Sem `www`
- Com `https://`

## Alteracoes tecnicas

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/meta-oauth-callback/index.ts` | Adicionar `console.log` com redirect_uri, appId, e code (parcial) antes da troca de token no `handleInstagramBusiness`. Forcar redirect_uri hardcoded `https://miauchat.com.br/auth/meta-callback` como fallback seguro |

Deploy: `meta-oauth-callback`

Apos o deploy, o usuario testa novamente e verificamos nos logs qual redirect_uri exato esta sendo enviado vs o que foi usado na autorizacao.

