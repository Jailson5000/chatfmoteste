

# Corrigir fluxo Instagram OAuth - Mover early return antes do token exchange do Facebook

## Problema raiz

No `meta-oauth-callback`, o fluxo e:

```text
1. Recebe code + type
2. Troca code via graph.facebook.com/oauth/access_token  <-- FALHA aqui para Instagram
3. Troca por long-lived token via Facebook
4. Se type === "whatsapp_cloud" com embedded signup -> return
5. Busca paginas via me/accounts
6. Se type === "whatsapp_cloud" -> return  
7. Se type === "instagram" -> handleInstagramBusiness()  <-- Nunca chega aqui
8. Facebook flow
```

O code gerado pelo `instagram.com/oauth/authorize` so pode ser trocado em `api.instagram.com/oauth/access_token`. Mas o backend tenta trocar via `graph.facebook.com` primeiro (passo 2), que retorna "Invalid platform app".

## Solucao

Mover o check de `type === "instagram"` para ANTES do token exchange do Facebook (antes da linha 84). Assim o Instagram vai direto para `handleInstagramBusiness()` que usa os endpoints corretos.

### `supabase/functions/meta-oauth-callback/index.ts`

Mover o bloco das linhas 157-161 para logo apos a validacao de `META_APP_ID`/`META_APP_SECRET` (depois da linha 80), antes do comentario "Step 1: Exchange code for token":

```text
ANTES (fluxo atual):
  validate META_APP_ID/SECRET
  exchange code via Facebook   <-- Instagram code falha aqui
  get long-lived token
  ...
  if (type === "instagram") -> handleInstagramBusiness  <-- nunca chega

DEPOIS (corrigido):
  validate META_APP_ID/SECRET
  if (type === "instagram") -> handleInstagramBusiness   <-- sai direto
  exchange code via Facebook   <-- so executa para facebook/whatsapp
  get long-lived token
  ...
```

## Arquivo alterado

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/meta-oauth-callback/index.ts` | Mover early return do Instagram para antes do token exchange do Facebook |

Deploy: `meta-oauth-callback`

## Resultado

O code do Instagram vai direto para `handleInstagramBusiness()` que usa `api.instagram.com/oauth/access_token` com o Instagram App ID correto, sem passar pelo endpoint do Facebook.

