
# Corrigir erro 401 no OAuth do Facebook e Instagram

## Causa raiz identificada

Os logs da infraestrutura mostram que **todas as chamadas POST para `meta-oauth-callback` retornam status 401** (Unauthorized). O problema NAO e com o token da Meta ou o redirect_uri - a funcao nem chega a trocar o codigo.

### Por que acontece o 401?

O fluxo atual funciona assim:

1. Usuario esta logado em `suporte.miauchat.com.br/settings`
2. Clica em "Conectar" -> abre popup para o OAuth da Meta
3. Meta redireciona o popup para `https://miauchat.com.br/auth/meta-callback?code=...`
4. O componente `MetaAuthCallback.tsx` no popup chama `supabase.functions.invoke("meta-oauth-callback", ...)`
5. O cliente Supabase no popup tenta enviar o token de autenticacao do `localStorage`
6. **PROBLEMA**: O popup esta em `miauchat.com.br`, mas o usuario fez login em `suporte.miauchat.com.br` - sao origens diferentes, entao o `localStorage` do popup NAO tem a sessao do usuario
7. A funcao recebe um token vazio/invalido e retorna 401

Alem disso, a funcao usa `supabase.auth.getClaims(token)` que pode nao existir na versao do `@supabase/supabase-js@2` importada no Deno, causando erro que tambem resulta em 401.

## Solucao

Mudar a arquitetura para que o popup NAO faca a chamada ao backend. Em vez disso, o popup apenas captura o `code` e envia de volta para a janela pai (que TEM a sessao) via `postMessage`.

### Mudancas necessarias:

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/MetaAuthCallback.tsx` | Em vez de chamar `supabase.functions.invoke` diretamente, enviar o `code` e `type` de volta para a janela pai via `postMessage` e fechar o popup |
| `src/components/settings/integrations/InstagramIntegration.tsx` | No handler de `postMessage`, receber o `code` e chamar `supabase.functions.invoke("meta-oauth-callback", ...)` a partir da janela pai (que tem sessao ativa) |
| `src/components/settings/integrations/FacebookIntegration.tsx` | Mesma mudanca: receber o `code` via `postMessage` e fazer a chamada ao backend a partir da janela pai |
| `supabase/functions/meta-oauth-callback/index.ts` | Substituir `supabase.auth.getClaims(token)` por `supabase.auth.getUser()` que e o metodo padrao e confiavel do Supabase JS v2 |

### Fluxo corrigido:

```text
Usuario (suporte.miauchat.com.br)
  |
  v
Clica "Conectar" -> Abre popup OAuth
  |
  v
Meta autentica -> Redireciona popup para miauchat.com.br/auth/meta-callback?code=XXX
  |
  v
MetaAuthCallback.tsx detecta que e popup -> Envia {type: "meta-oauth-code", code, connectionType} via postMessage -> Fecha popup
  |
  v
Janela pai (suporte.miauchat.com.br) recebe o code -> Chama supabase.functions.invoke("meta-oauth-callback", {code, redirectUri, type}) COM sessao ativa
  |
  v
Edge function recebe token valido -> Troca code por token Meta -> Salva conexao -> Retorna sucesso
```

### Deploy: `meta-oauth-callback`
