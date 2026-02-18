

# Corrigir Envio de Mensagens para Instagram

## Problema

O sistema recebe mensagens do Instagram normalmente (nome e foto funcionam), mas nao consegue ENVIAR mensagens de volta. O erro da API da Meta e:

```
"pages_messaging permission(s) must be granted before impersonating a user's page"
code: 190 (OAuthException)
```

## Diagnostico

A funcao `sendMessagingMessage` no arquivo `supabase/functions/meta-api/index.ts` usa o endpoint `/me/messages` para enviar mensagens no Instagram. Porem, a API de Mensagens do Instagram exige o uso explicito do **Page ID** no endpoint (`/{page_id}/messages`) em vez do alias `/me`. Embora `/me` funcione para o Facebook Messenger, para o Instagram ele gera o erro de "impersonating a user's page".

Evidencia:
- O token funciona para LEITURA (buscar perfil do contato via GET) -- "Profile resolved: Jailson Ferreira"
- O token FALHA para ESCRITA (enviar mensagem via POST /me/messages) -- erro 190
- A conexao correta (`b7cf1da1`) e encontrada com `page_id: 977414192123496`
- Mas o `page_id` nao e passado para a funcao de envio

## Solucao

### Arquivo: `supabase/functions/meta-api/index.ts`

1. **Passar `page_id` e `origin` para a funcao `sendMessagingMessage`**

   Na chamada (linha ~684):
   ```
   // Antes:
   graphResponse = await sendMessagingMessage(accessToken, recipientId, content, messageType, mediaUrl);
   
   // Depois:
   graphResponse = await sendMessagingMessage(accessToken, recipientId, content, messageType, mediaUrl, connection.page_id, origin);
   ```

2. **Alterar a funcao `sendMessagingMessage` para usar `/{page_id}/messages` no Instagram**

   A funcao passa a aceitar `pageId` e `origin` opcionais. Quando `origin === "INSTAGRAM"` e um `pageId` esta disponivel, usa `/{pageId}/messages` em vez de `/me/messages`:

   ```typescript
   async function sendMessagingMessage(
     accessToken: string,
     recipientId: string,
     content: string,
     messageType: string,
     mediaUrl?: string,
     pageId?: string,
     origin?: string
   ): Promise<Response> {
     // ... payload unchanged ...
     
     const endpoint = (origin === "INSTAGRAM" && pageId)
       ? `${GRAPH_API_BASE}/${pageId}/messages`
       : `${GRAPH_API_BASE}/me/messages`;
     
     return fetch(endpoint, { ... });
   }
   ```

## Impacto

- 1 arquivo alterado: `supabase/functions/meta-api/index.ts`
- Apenas o envio para Instagram e afetado
- Facebook Messenger continua usando `/me/messages` (sem mudanca)
- Nao requer reconexao do Instagram

## Risco

Baixo. Apenas altera o endpoint usado para Instagram. O `/{page_id}/messages` com page token e o metodo documentado pela Meta para a API de Mensagens do Instagram.

