

# Migrar Instagram para Instagram Business Login

## Problema Raiz

O sistema usa **Facebook Login** para Instagram, obtendo Page Access Tokens que funcionam em `graph.facebook.com`. Porem, a API de mensagens do Instagram requer **Instagram Business Login**, que usa tokens nativos do Instagram em `graph.instagram.com`.

Evidencia: os logs mostram que a inscricao de webhook falha com "Invalid OAuth access token" porque Page Access Tokens nao sao aceitos para operacoes Instagram-specific. O MiauChat funciona porque pode ter sido inscrito manualmente ou com configuracao diferente no painel da Meta.

A documentacao oficial da Meta (que o usuario compartilhou) confirma que Instagram Business Login e o caminho correto:
- OAuth: `instagram.com/oauth/authorize`
- Token exchange: `api.instagram.com/oauth/access_token`
- Long-lived: `graph.instagram.com/access_token?grant_type=ig_exchange_token`
- Webhook subscribe: `graph.instagram.com/{ig_user_id}/subscribed_apps`
- Envio de mensagens: `graph.instagram.com/{ig_user_id}/messages`

Os segredos `META_INSTAGRAM_APP_ID` e `META_INSTAGRAM_APP_SECRET` ja estao configurados no projeto mas nunca sao usados.

## Problemas Adicionais

1. **Toggle liga/desliga**: Funciona no banco mas o resubscribe automatico falha silenciosamente (usa endpoint errado)
2. **Botao Configuracoes**: Ja tem handler (corrigido anteriormente), deve funcionar
3. **Facebook nome/foto**: Codigo corrigido mas meta-webhook precisa ser redeployado (logs mostram codigo antigo rodando)

## Alteracoes

### Arquivo 1: `src/lib/meta-config.ts`

Adicionar funcao `buildInstagramBusinessLoginUrl()` que usa Instagram Login:

```typescript
// Scopes para Instagram Business Login (novos, obrigatorios desde Jan 2025)
export const INSTAGRAM_BUSINESS_SCOPES = "instagram_business_basic,instagram_business_manage_messages";

export function buildInstagramBusinessLoginUrl(): string {
  const redirectUri = getFixedRedirectUri("instagram");
  const state = JSON.stringify({ type: "instagram" });
  return `https://www.instagram.com/oauth/authorize?client_id=${META_INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${INSTAGRAM_BUSINESS_SCOPES}&response_type=code&state=${encodeURIComponent(state)}&enable_fb_login=0&force_authentication=1`;
}
```

### Arquivo 2: `src/components/settings/integrations/InstagramIntegration.tsx`

- Trocar `buildMetaOAuthUrl("instagram")` por `buildInstagramBusinessLoginUrl()`
- Simplificar o fluxo: Instagram Login retorna a conta diretamente, sem necessidade de page picker
- Chamar `meta-oauth-callback` com `type: "instagram"` e `flow: "instagram_login"` para usar o novo fluxo

### Arquivo 3: `supabase/functions/meta-oauth-callback/index.ts`

Adicionar novo fluxo `instagram_login` que:

1. **Troca o codigo** em `api.instagram.com/oauth/access_token` usando `META_INSTAGRAM_APP_SECRET`
2. **Obtem token long-lived** em `graph.instagram.com/access_token?grant_type=ig_exchange_token`
3. **Busca dados da conta** em `graph.instagram.com/me?fields=user_id,username,name,profile_picture_url`
4. **Inscreve webhooks** em `graph.instagram.com/{ig_user_id}/subscribed_apps` com campo `messages`
5. **Salva conexao** no banco com token do Instagram (nao Page token)

```typescript
if (type === "instagram" && body.flow === "instagram_login") {
  const IG_APP_ID = Deno.env.get("META_INSTAGRAM_APP_ID");
  const IG_APP_SECRET = Deno.env.get("META_INSTAGRAM_APP_SECRET");

  // 1. Exchange code for short-lived token
  const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: IG_APP_ID,
      client_secret: IG_APP_SECRET,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  const { access_token, user_id } = await tokenRes.json();

  // 2. Exchange for long-lived token (60 days)
  const longRes = await fetch(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${IG_APP_SECRET}&access_token=${access_token}`
  );
  const { access_token: longToken, expires_in } = await longRes.json();

  // 3. Get account info
  const meRes = await fetch(
    `https://graph.instagram.com/me?fields=user_id,username,name,profile_picture_url&access_token=${longToken}`
  );
  const me = await meRes.json();

  // 4. Subscribe to webhooks
  const subRes = await fetch(
    `https://graph.instagram.com/v22.0/${me.user_id}/subscribed_apps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscribed_fields: "messages",
        access_token: longToken,
      }),
    }
  );

  // 5. Save connection with IG token
  // ... upsert into meta_connections
}
```

### Arquivo 4: `supabase/functions/meta-api/index.ts`

- **Resubscribe para Instagram**: Usar `graph.instagram.com` com IG token
- **Envio de mensagens Instagram**: Usar `graph.instagram.com/{ig_account_id}/messages` com IG token (em vez de `graph.facebook.com/{page_id}/messages` com Page token)

### Arquivo 5: `supabase/functions/meta-webhook/index.ts`

- Garantir que o deploy inclua a correcao do Facebook profile (`first_name,last_name,profile_pic`)
- Para Instagram, manter `name,profile_pic` (funciona com IG token)

## Detalhes Tecnicos

### Diferenca entre os dois fluxos OAuth

```text
ANTES (Facebook Login - NAO FUNCIONA para IG DM):
  Frontend -> facebook.com/dialog/oauth (META_APP_ID)
  Backend  -> graph.facebook.com/oauth/access_token (META_APP_SECRET)
  Token    -> Page Access Token
  Subscribe-> graph.facebook.com/{ig_id}/subscribed_apps (FALHA!)
  Send     -> graph.facebook.com/{page_id}/messages

DEPOIS (Instagram Business Login - CORRETO):
  Frontend -> instagram.com/oauth/authorize (META_INSTAGRAM_APP_ID)
  Backend  -> api.instagram.com/oauth/access_token (META_INSTAGRAM_APP_SECRET)
  Token    -> Instagram User Access Token
  Subscribe-> graph.instagram.com/{ig_user_id}/subscribed_apps (OK!)
  Send     -> graph.instagram.com/{ig_user_id}/messages
```

### Impacto no banco de dados

A tabela `meta_connections` nao precisa de alteracoes. O campo `ig_account_id` armazenara o `user_id` retornado pelo Instagram Login. O campo `page_id` sera preenchido com o mesmo valor (ou null, ja que nao ha Page envolvida nesse fluxo). O campo `access_token` armazenara o IG User Access Token (criptografado).

### Fluxo simplificado no frontend

Com Instagram Business Login, o usuario ve a tela do Instagram diretamente (nao precisa passar pelo Facebook). Apos autorizar, o sistema obtem a conta Instagram automaticamente -- nao ha necessidade de page picker (dialog de selecao de pagina), pois o Instagram Login retorna diretamente a conta autorizada.

## Arquivos Alterados

1. `src/lib/meta-config.ts` - nova funcao `buildInstagramBusinessLoginUrl`
2. `src/components/settings/integrations/InstagramIntegration.tsx` - usar novo OAuth URL, simplificar fluxo
3. `supabase/functions/meta-oauth-callback/index.ts` - novo fluxo de token exchange via `api.instagram.com`
4. `supabase/functions/meta-api/index.ts` - usar `graph.instagram.com` para resubscribe e envio de mensagens Instagram
5. `supabase/functions/meta-webhook/index.ts` - redeploy com correcao do Facebook profile

## Acoes Manuais Necessarias

1. **Verificar redirect URI**: No painel Meta Developer, na configuracao do Instagram App (ID: 1447135433693990), verificar que `https://miauchat.com.br/auth/meta-callback` esta cadastrada como redirect URI valida
2. **Apos deploy**: Desconectar e reconectar o Instagram da FMO usando o novo fluxo
3. **Instagram**: Garantir que "Permitir acesso a mensagens" esta ativado em Configuracoes > Mensagens > Ferramentas conectadas

