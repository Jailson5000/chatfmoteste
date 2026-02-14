
# Corrigir fluxo OAuth do Instagram Business

## Problema raiz

O Instagram Business Login (permissoes `instagram_business_basic`, `instagram_business_manage_messages`) usa o **dialogo do Facebook** (`facebook.com/dialog/oauth`) com o **Facebook App ID** (`1237829051015100`). 

O codigo atual usa incorretamente:
- Endpoint: `instagram.com/oauth/authorize` (errado - isso e para o Instagram Consumer API)
- App ID: `META_INSTAGRAM_APP_ID` (`1447135433693990`) (errado - deve usar o Facebook App ID)

Isso gera o erro "Invalid platform app" porque o Instagram nao reconhece esse App ID nesse endpoint.

## Solucao

### 1. Frontend: `src/lib/meta-config.ts`

Mudar `buildMetaOAuthUrl("instagram")` para usar o **mesmo dialogo do Facebook** mas com os scopes do Instagram:

```text
ANTES (errado):
  https://www.instagram.com/oauth/authorize?client_id=1447135433693990&...

DEPOIS (correto):
  https://www.facebook.com/v22.0/dialog/oauth?client_id=1237829051015100&scope=instagram_business_basic,instagram_business_manage_messages,instagram_manage_comments&...
```

Ambos Instagram e Facebook usam `facebook.com/dialog/oauth` -- a diferenca sao os **scopes**.

### 2. Backend: `supabase/functions/meta-oauth-callback/index.ts`

Remover o early return do Instagram (linhas 82-87). O code gerado pelo dialogo do Facebook deve ser trocado via `graph.facebook.com/oauth/access_token` (fluxo normal do Facebook).

O codigo existente nas linhas 164-198 **ja sabe** tratar `type === "instagram"`:
- Seleciona a pagina que tem `instagram_business_account`
- Salva o `ig_account_id`
- Faz subscribe nos webhooks

A funcao `handleInstagramBusiness` (que usa `api.instagram.com`) nao sera mais usada pelo OAuth, mas pode ser mantida para referencia.

### 3. Frontend: redirect_uri

Como agora o Instagram usa o dialogo do Facebook, a redirect_uri deve ser a mesma do Facebook (nao precisa mais da URI fixa do Instagram). O `getFixedRedirectUri` para Instagram passa a seguir a mesma logica do Facebook.

## Fluxo corrigido

```text
1. Usuario clica "Conectar" Instagram
2. Popup abre: facebook.com/dialog/oauth?client_id=1237829051015100&scope=instagram_business_basic,...
3. Usuario autoriza no Facebook
4. Redirect para /auth/meta-callback?code=XXX&state={"type":"instagram"}
5. Backend troca code via graph.facebook.com/oauth/access_token (fluxo Facebook normal)
6. Backend busca paginas via me/accounts
7. Backend seleciona pagina com instagram_business_account
8. Salva conexao com type="instagram" e ig_account_id
```

## Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `src/lib/meta-config.ts` | Instagram usa `facebook.com/dialog/oauth` com `META_APP_ID` em vez de `instagram.com/oauth/authorize` |
| `supabase/functions/meta-oauth-callback/index.ts` | Remover early return do Instagram (linhas 82-87). Deixar o fluxo Facebook normal tratar, que ja tem logica para `type === "instagram"` |

Deploy: `meta-oauth-callback`
