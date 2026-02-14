

# Corrigir Instagram Business Login - Usar endpoints corretos da documentacao oficial

## Problema

O erro "Invalid Scopes: instagram_business_basic, instagram_business_manage_messages" ocorre porque os scopes `instagram_business_*` so sao validos no dialogo do **Instagram** (`instagram.com/oauth/authorize`), NAO no dialogo do Facebook (`facebook.com/dialog/oauth`).

A documentacao oficial da Meta confirma que o Instagram Business Login usa endpoints totalmente separados do Facebook Login:

- **Autorizacao**: `https://www.instagram.com/oauth/authorize`
- **Token exchange**: `POST https://api.instagram.com/oauth/access_token`
- **Long-lived token**: `GET https://graph.instagram.com/access_token`
- **Client ID**: Instagram App ID (nao o Facebook App ID)
- **Client Secret**: Instagram App Secret (nao o Facebook App Secret)

## Alteracoes necessarias

### 1. Frontend: `src/lib/meta-config.ts`

Restaurar `buildMetaOAuthUrl("instagram")` para usar o dialogo do Instagram:

```text
ANTES (errado):
  https://www.facebook.com/v22.0/dialog/oauth?client_id=1237829051015100&scope=instagram_business_basic,...

DEPOIS (correto - conforme docs):
  https://www.instagram.com/oauth/authorize?client_id=1447135433693990&scope=instagram_business_basic,...&redirect_uri=https://miauchat.com.br/auth/meta-callback&response_type=code&state=...
```

Usar `META_INSTAGRAM_APP_ID` (1447135433693990) e forcar `redirect_uri` fixa para `https://miauchat.com.br/auth/meta-callback` (independente do dominio atual).

### 2. Backend: `supabase/functions/meta-oauth-callback/index.ts`

Re-adicionar o early return para Instagram ANTES do token exchange do Facebook. A funcao `handleInstagramBusiness` ja existe e esta correta:
- Troca code em `api.instagram.com/oauth/access_token`
- Obtem long-lived token em `graph.instagram.com/access_token`
- Salva conexao com `source: "oauth"`

Porem precisa usar o **Instagram App Secret** (nao o Facebook App Secret). Adicionar leitura de `META_INSTAGRAM_APP_SECRET` (com fallback para `META_APP_SECRET`).

### 3. Secret: `META_INSTAGRAM_APP_SECRET`

O secret `META_INSTAGRAM_APP_ID` ja existe. Precisamos tambem do **Instagram App Secret** que e diferente do Facebook App Secret.

Esse valor esta em: **App Dashboard > Instagram > API setup with Instagram login > 3. Set up Instagram business login > Business login settings > Instagram app secret**

### 4. Meta Dashboard: URI de redirecionamento

Na configuracao do Instagram Business Login no Meta Dashboard, a URI de redirecionamento deve ser exatamente:
`https://miauchat.com.br/auth/meta-callback`

## Resumo de alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `src/lib/meta-config.ts` | Instagram usa `instagram.com/oauth/authorize` com `META_INSTAGRAM_APP_ID`, redirect fixo para `miauchat.com.br/auth/meta-callback` |
| `src/pages/MetaAuthCallback.tsx` | Passar tipo para `getFixedRedirectUri` para Instagram usar URI fixa |
| `supabase/functions/meta-oauth-callback/index.ts` | Re-adicionar early return do Instagram usando `handleInstagramBusiness` com `META_INSTAGRAM_APP_SECRET` |
| Secret | Solicitar `META_INSTAGRAM_APP_SECRET` ao usuario |

Deploy: `meta-oauth-callback`

## Fluxo correto (conforme documentacao oficial)

```text
1. Usuario clica "Conectar Instagram"
2. Popup: instagram.com/oauth/authorize?client_id=1447135433693990&redirect_uri=https://miauchat.com.br/auth/meta-callback&scope=instagram_business_basic,...
3. Usuario autoriza
4. Redirect: miauchat.com.br/auth/meta-callback?code=XXX
5. Frontend envia code ao backend (meta-oauth-callback)
6. Backend troca code em api.instagram.com/oauth/access_token (Instagram App ID + Secret)
7. Backend troca short-lived por long-lived em graph.instagram.com/access_token
8. Backend busca perfil em graph.instagram.com/v22.0/me
9. Salva conexao na tabela meta_connections
```

