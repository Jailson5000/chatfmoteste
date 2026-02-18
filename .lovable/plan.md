
# Corrigir Recebimento de Mensagens Instagram - Causa Raiz Encontrada

## Problema Real Identificado

Analisando a documentacao oficial da Meta (https://developers.facebook.com/docs/instagram-platform/webhooks/), descobri que existem **dois niveis de inscricao de webhook**, e o sistema so faz um deles:

1. **Inscricao da Pagina (Facebook)** - `POST graph.facebook.com/{page_id}/subscribed_apps` -- O sistema JA FAZ isso. Funciona para Facebook Messenger.

2. **Inscricao do Instagram** - `POST graph.instagram.com/{ig_account_id}/subscribed_apps?subscribed_fields=messages` -- O sistema NAO FAZ isso. E OBRIGATORIO para Instagram DM.

A documentacao da Meta diz explicitamente na secao "Enable Subscriptions":

```text
POST /me/subscribed_apps
  ?subscribed_fields=messages
  &access_token={page_access_token}

Onde /me representa o Instagram professional account ID
Endpoint: https://graph.instagram.com/v22.0/{ig_account_id}/subscribed_apps
```

Isso explica por que a conta FMO nao aparece nos "Limites de volume do Instagram" no painel da Meta -- ela nunca foi inscrita no nivel do Instagram.

MiauChat provavelmente funciona porque foi inscrita manualmente ou em uma versao anterior do codigo.

## Requisito Adicional (Manual)

A documentacao da Meta tambem exige que o dono da conta Instagram ative manualmente:

**Instagram > Configuracoes > Mensagens e respostas de stories > Controles de mensagens > Ferramentas conectadas > Permitir acesso a mensagens**

Sem isso, a API nao recebe mensagens mesmo com a inscricao correta.

## Alteracoes no Codigo

### 1. `supabase/functions/meta-oauth-callback/index.ts`

Apos salvar a conexao Instagram e fazer o `POST /{page_id}/subscribed_apps` no graph.facebook.com, adicionar uma chamada ADICIONAL:

```typescript
// Instagram-specific subscription (REQUIRED for IG DM webhooks)
if (igBizId) {
  const igSubRes = await fetch(
    `https://graph.instagram.com/${GRAPH_API_VERSION}/${igBizId}/subscribed_apps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscribed_fields: "messages",
        access_token: pageAccessToken,
      }),
    }
  );
  const igSubData = await igSubRes.json();
  console.log("[meta-oauth] Instagram account subscription:", JSON.stringify(igSubData));
}
```

### 2. `supabase/functions/meta-api/index.ts` (acao resubscribe)

Atualizar a acao `resubscribe` para TAMBEM chamar o endpoint do Instagram:

```typescript
// Step 2b: Subscribe Instagram account specifically
if (resubConn.ig_account_id) {
  const igSubRes = await fetch(
    `https://graph.instagram.com/${GRAPH_API_VERSION}/${resubConn.ig_account_id}/subscribed_apps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscribed_fields: "messages",
        access_token: resubToken,
      }),
    }
  );
  const igSubData = await igSubRes.json();
  console.log("[meta-api] Instagram account resubscribe:", JSON.stringify(igSubData));
}
```

### 3. `src/components/settings/integrations/InstagramIntegration.tsx`

- Remover os botoes "Reinscrever Webhooks" e "Diagnostico"
- Remover o Dialog de diagnostico e todo o estado relacionado (diagOpen, diagReport, diagLoading)
- Remover as funcoes handleResubscribe e handleDiagnose
- Manter o resubscribe automatico ao ativar o toggle (mas agora ele ira incluir a chamada correta ao Instagram)
- Limpar imports nao utilizados (RefreshCw, Stethoscope, Dialog, etc.)

### 4. Adicionar `pages_manage_metadata` ao escopo OAuth

No `src/lib/meta-config.ts`, adicionar o escopo `pages_manage_metadata` que a documentacao da Meta exige para Instagram Messaging:

```typescript
instagram: "pages_show_list,pages_messaging,pages_manage_metadata,instagram_basic,instagram_manage_messages",
```

## Acao Manual Necessaria

Apos o deploy do codigo, o dono da conta Instagram @fmoadvbr deve:
1. Abrir o Instagram no celular
2. Ir em Configuracoes > Privacidade > Mensagens (ou Configuracoes > Mensagens e respostas de stories)
3. Procurar "Controles de mensagens" ou "Ferramentas conectadas"
4. Ativar "Permitir acesso a mensagens"
5. Desconectar e reconectar o Instagram no sistema (para disparar a nova inscricao)

## Arquivos Alterados

1. `supabase/functions/meta-oauth-callback/index.ts` - adicionar inscricao no graph.instagram.com
2. `supabase/functions/meta-api/index.ts` - adicionar inscricao Instagram no resubscribe
3. `src/components/settings/integrations/InstagramIntegration.tsx` - remover botoes Diagnostico e Reinscrever
4. `src/lib/meta-config.ts` - adicionar pages_manage_metadata ao escopo
