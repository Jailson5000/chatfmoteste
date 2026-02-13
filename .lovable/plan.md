
# Corrigir Webhook Meta: Mensagens Nao Chegam na Plataforma

## Problemas Identificados

### Problema 1: Lookup do Instagram no webhook esta errado
Os logs mostram claramente:
```
No active connection for page: 17841479...
```
O webhook recebe mensagens do Instagram com `recipient.id = 17841479677897649` (ID da conta Instagram), mas a tabela `meta_connections` armazena `page_id: 977414192123496` (ID da pagina Facebook). O lookup `eq("page_id", recipientId)` falha para Instagram.

### Problema 2: Pagina nao inscrita no webhook
Apos conectar via OAuth, o sistema nao chama `POST /{page-id}/subscribed_apps` na Graph API. Sem isso, a Meta nao envia eventos de mensagens para o webhook. Isso explica por que mensagens do Facebook Messenger tambem nao chegam.

### Problema 3: Separacao Instagram vs Facebook nos botoes
Os dois botoes (Instagram e Facebook) ambos abrem o login do Facebook - isso e normal porque Instagram Business e vinculado a uma Pagina do Facebook. Os escopos ja sao diferentes e criam conexoes separadas. Nao ha como evitar que a Meta mostre a tela de selecao de pagina.

---

## Mudancas no Codigo

### Mudanca 1: Webhook - corrigir lookup para Instagram
**Arquivo:** `supabase/functions/meta-webhook/index.ts`

Na funcao `processMessagingEntry`, quando o `origin` e "INSTAGRAM", o `recipientId` e o ID da conta Instagram, nao o page_id. Corrigir para buscar por `ig_account_id` quando o tipo e Instagram:

```typescript
let connection;
if (connectionType === "instagram") {
  // Instagram sends IG account ID as recipient, not page ID
  const { data } = await supabase
    .from("meta_connections")
    .select("id, law_firm_id, ...")
    .eq("ig_account_id", recipientId)
    .eq("type", connectionType)
    .eq("is_active", true)
    .maybeSingle();
  connection = data;
} else {
  // Facebook sends page ID as recipient
  const { data } = await supabase
    .from("meta_connections")
    .select("id, law_firm_id, ...")
    .eq("page_id", recipientId)
    .eq("type", connectionType)
    .eq("is_active", true)
    .maybeSingle();
  connection = data;
}
```

### Mudanca 2: Inscrever pagina no webhook apos OAuth
**Arquivo:** `supabase/functions/meta-oauth-callback/index.ts`

Apos salvar a conexao com sucesso, chamar a Graph API para inscrever a pagina nos webhooks. Sem isso, a Meta nao envia eventos:

```typescript
// Subscribe page to webhooks (required for receiving messages)
await fetch(
  `${GRAPH_API_BASE}/${selectedPage.id}/subscribed_apps`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscribed_fields: ["messages", "messaging_postbacks", "messaging_optins"],
      access_token: pageAccessToken,
    }),
  }
);
```

Para Instagram, tambem precisa inscrever os campos de mensagens do Instagram na pagina vinculada.

### Mudanca 3: Redeployar edge functions
Apos as correcoes, redeployar `meta-webhook` e `meta-oauth-callback`.

---

## Sobre a Separacao dos Botoes

Ambos os botoes (Instagram e Facebook) abrem a mesma tela de login da Meta - isso e por design da Meta, nao ha como mudar. A diferenca e nos **escopos** solicitados:
- **Instagram**: `instagram_basic, instagram_manage_messages, pages_show_list`
- **Facebook**: `pages_messaging, pages_manage_metadata, pages_show_list`

O resultado e que cada botao cria um registro `meta_connections` com `type` diferente ("instagram" vs "facebook"), o que e o comportamento correto.

---

## Resultado Esperado

Apos as correcoes:
- Mensagens enviadas para o Instagram da pagina conectada chegarao na plataforma
- Mensagens enviadas para o Facebook Messenger da pagina conectada chegarao na plataforma
- O webhook conseguira encontrar a conexao correta para cada canal
