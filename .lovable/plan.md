

# Corrigir Instagram OAuth - Usar endpoint e App ID corretos

## Problema

Existem dois problemas distintos que causaram as falhas anteriores:

1. Os scopes `instagram_business_*` sao **invalidos** no endpoint `facebook.com/dialog/oauth` (esse endpoint so aceita scopes do Facebook como `pages_show_list`). Por isso aparece "Invalid Scopes".

2. O endpoint `instagram.com/oauth/authorize` requer o **Instagram App ID** (que e diferente do Facebook App ID). Por isso apareceu "Invalid platform app" na tentativa anterior.

A documentacao oficial da Meta confirma que o **Instagram Business Login** usa:
- Endpoint: `https://www.instagram.com/oauth/authorize`
- Client ID: o **Instagram App ID** (encontrado em App Dashboard > App Settings > Basic)
- Scopes: `instagram_business_basic`, `instagram_business_manage_messages`, etc.
- Token exchange: `https://api.instagram.com/oauth/access_token`

## Solucao

### 1. `src/lib/meta-config.ts`

- Adicionar constante `META_INSTAGRAM_APP_ID` com valor `1447135433693990` (conforme URL fornecido pelo usuario)
- Atualizar scopes do Instagram para incluir todos os scopes do URL de referencia (sem `pages_show_list`)
- Alterar `buildMetaOAuthUrl` para usar `instagram.com/oauth/authorize` com o Instagram App ID quando `type === "instagram"`

Scopes do Instagram:
```
instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights
```

### 2. `supabase/functions/meta-oauth-callback/index.ts`

- Re-ativar o early return para `type === "instagram"` que chama `handleInstagramBusiness`
- Atualizar `handleInstagramBusiness` para usar o Instagram App ID (via env var `META_INSTAGRAM_APP_ID` ou fallback para `META_APP_ID`)
- A funcao `handleInstagramBusiness` ja existe no codigo e faz o flow correto:
  1. Troca code por short-lived token via `api.instagram.com/oauth/access_token`
  2. Troca por long-lived token via `graph.instagram.com/access_token`
  3. Busca perfil via `graph.instagram.com/me`
  4. Salva na `meta_connections`

### 3. Secret `META_INSTAGRAM_APP_ID`

- Adicionar o secret `META_INSTAGRAM_APP_ID` com valor `1447135433693990` para a edge function poder usar no token exchange

## Resumo de arquivos

| Arquivo | Alteracao |
|---------|-----------|
| `src/lib/meta-config.ts` | Instagram App ID separado + endpoint `instagram.com/oauth/authorize` + scopes corretos |
| `supabase/functions/meta-oauth-callback/index.ts` | Re-ativar `handleInstagramBusiness` com Instagram App ID |

Deploy: `meta-oauth-callback`

## Fluxo corrigido

```text
1. Usuario clica "Conectar" no card do Instagram
2. Popup abre em instagram.com/oauth/authorize (com Instagram App ID)
3. Usuario autoriza a conta Instagram Professional
4. Redirect para callback com code
5. Backend troca code via api.instagram.com (com Instagram App ID + App Secret)
6. Salva conexao, popup fecha, card mostra "Conectado"
```

