
# Corrigir fluxo OAuth do Instagram para funcionar igual ao Facebook

## Problema

O componente `InstagramIntegration.tsx` ja tem o mesmo codigo do `FacebookIntegration.tsx` (popup OAuth com `buildMetaOAuthUrl("instagram")`), porem quando o usuario clica "Conectar", o popup da Meta rejeita os scopes e nao completa o fluxo. Resultado: a unica forma de conectar Instagram e pela pagina de teste manual, que nao serve para filmar a demonstracao para o App Review.

Os logs confirmam: Facebook OAuth funciona (token trocado, conexao salva, webhook inscrito), mas nenhuma tentativa de Instagram OAuth chegou ao backend -- o erro acontece no dialog da Meta antes do redirect.

## Causa raiz

O app Meta esta configurado com a **nova API Instagram Business** (`instagram_business_basic`, `instagram_business_manage_messages`), mas o codigo solicita os scopes **legados** (`instagram_basic`, `instagram_manage_messages`). Meta rejeita scopes que nao estao configurados no app.

O problema anterior de "Invalid Scopes" com os scopes business provavelmente aconteceu porque as permissoes estavam em status "Ready for testing" e nao "Approved for testing". Ou porque faltava o scope `business_management` que e pre-requisito.

## Solucao

### 1. `src/lib/meta-config.ts` - Scopes corretos com fallback

Atualizar os scopes do Instagram para usar os da nova API Business, que e o que esta configurado no app Meta:

```
ANTES:
instagram: "instagram_basic,instagram_manage_messages,pages_show_list"

DEPOIS:
instagram: "instagram_business_basic,instagram_business_manage_messages,instagram_business_content_publish"
```

**Nota importante**: os scopes da nova Instagram Business API **nao** usam `pages_show_list` -- esse e um scope do Facebook Login. Para Instagram Business Login, os scopes sao diferentes.

### 2. `src/lib/meta-config.ts` - Usar endpoint correto para Instagram

A nova API Instagram Business usa um endpoint de OAuth **diferente** do Facebook:
- Facebook: `https://www.facebook.com/v22.0/dialog/oauth`
- Instagram Business: `https://www.instagram.com/oauth/authorize`

Atualizar `buildMetaOAuthUrl` para usar o endpoint correto quando `type === "instagram"`.

### 3. `supabase/functions/meta-oauth-callback/index.ts` - Tratar token do Instagram Business

O flow de token do Instagram Business API e diferente:
- O token retornado e um token de curta duracao do Instagram (nao do Facebook)
- A troca por long-lived token usa endpoint diferente: `https://graph.instagram.com/access_token`
- O token do Instagram acessa diretamente a conta IG (sem precisar de page_id intermediario)

Adicionar tratamento especifico para `type === "instagram"` que:
1. Troca o code por short-lived token via `https://api.instagram.com/oauth/access_token`
2. Troca por long-lived token via `https://graph.instagram.com/access_token`
3. Busca info da conta via `https://graph.instagram.com/v22.0/me?fields=user_id,username,name,profile_picture_url`
4. Salva na `meta_connections` com os dados corretos

### 4. `src/components/settings/integrations/InstagramIntegration.tsx` - Limpar codigo

Remover imports nao utilizados (`useState`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Badge`, `ExternalLink`, `Loader2`, `Trash2`, `RefreshCw`) e o state `isConnecting` que nao e usado. Deixar identico ao padrao do Facebook.

## Resumo de arquivos

| Arquivo | Alteracao |
|---------|-----------|
| `src/lib/meta-config.ts` | Scopes business + endpoint OAuth do Instagram separado |
| `supabase/functions/meta-oauth-callback/index.ts` | Flow de token especifico para Instagram Business API |
| `src/components/settings/integrations/InstagramIntegration.tsx` | Limpar imports nao usados |

Deploy: `meta-oauth-callback`

## Fluxo apos a correcao

1. Usuario clica "Conectar" no card do Instagram
2. Popup abre em `instagram.com/oauth/authorize` (nao facebook.com)
3. Usuario escolhe a conta Instagram e autoriza
4. Redirect para callback com code
5. Backend troca code por token do Instagram, busca dados da conta
6. Salva conexao no banco, popup fecha, card mostra "Conectado"

Esse fluxo e filmavel para o App Review da Meta.
