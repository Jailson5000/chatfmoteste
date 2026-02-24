

# Fase 3: Provider Detection em send_message_async, send_media_async e Demais Actions

## Resumo

A camada de abstracao (`whatsapp-provider.ts`) ja esta completa com implementacoes para Evolution e uazapi. As actions `get_qrcode`, `get_status`, `refresh_status`, `refresh_phone`, `configure_webhook`, `get_settings`, `set_settings`, `delete_instance` e `logout_instance` ja usam provider detection. Falta aplicar nas actions de envio de mensagens e nas actions restantes.

## Actions que precisam de provider detection

### Prioridade Alta (envio de mensagens - usadas constantemente)

1. **`send_message_async`** (linha 2620) - Envio assincrono de texto
   - Background task faz `fetch` direto para Evolution endpoints
   - Precisa detectar `instance.api_provider` e usar `UazapiProvider.sendText()` para uazapi
   - Inclui logica de media template pattern `[IMAGE]url` que tambem precisa de routing
   - Logica de "Connection Closed" e auto-recovery precisa de tratamento diferenciado para uazapi

2. **`send_media_async`** (linha 3354) - Envio assincrono de midia
   - Background task faz `fetch` direto para Evolution endpoints (sendMedia, sendWhatsAppAudio)
   - Para uazapi: usar `UazapiProvider.sendMedia()` para todos os tipos
   - Audio PTT: uazapi usa mesmo endpoint `/send/media` com `type: "audio"` (sem endpoint separado)

3. **`send_message`** (linha 3114) - Envio sincrono (legacy)
   - Faz `fetch` direto para `sendText`
   - Substituir por `provider.sendText()`

4. **`send_media`** (linha 3639) - Envio sincrono de midia (legacy)
   - Faz `fetch` direto para `sendMedia`
   - Substituir por `provider.sendMedia()`

### Prioridade Media (funcionalidades complementares)

5. **`get_media`** (linha 3218) - Descriptografar midia
   - Evolution: chama `getBase64FromMediaMessage`
   - uazapi: midia ja vem como base64 no webhook, entao nao precisa desse endpoint. Retornar erro informativo.

6. **`delete_message`** (linha 4933) - Apagar mensagem
   - Ja existe `UazapiProvider.deleteMessage()` no provider
   - Precisa detectar provider e delegar

7. **`send_reaction`** (linha 5021) - Reagir com emoji
   - Ja existe `UazapiProvider.sendReaction()` no provider
   - Precisa detectar provider e delegar

8. **`fetch_profile_picture`** (linha 5102) - Buscar foto de perfil
   - Evolution: chama `fetchProfilePictureUrl`
   - uazapi: chamar `/contacts/profile-picture` com header `token`

### Prioridade Baixa (global admin - Evolution-only por enquanto)

9. **`global_*` endpoints** (linhas 4067-4696) - Gerenciamento centralizado
   - Estes endpoints usam `EVOLUTION_BASE_URL` e `EVOLUTION_GLOBAL_API_KEY` hardcoded
   - Para a Fase 3, manter como Evolution-only (uazapi nao usa gerenciamento centralizado - cada instancia tem seu proprio token)
   - Futuramente, se necessario, adicionar suporte a uazapi no global admin

## Detalhes Tecnicos

### send_message_async - Modificacao principal

O background task (`backgroundSend`) faz chamadas HTTP diretas. A mudanca sera:

```
// ANTES (Evolution-only):
const sendResponse = await fetch(`${apiUrl}/message/sendText/${instance.instance_name}`, {
  headers: { apikey: instance.api_key || "" },
  body: JSON.stringify({ number: targetNumber, text: body.message }),
});

// DEPOIS (dual-provider):
const providerConfig = getProviderConfig(instance);
const provider = getProvider(providerConfig);
const result = await provider.sendText(providerConfig, {
  number: targetNumber,
  text: body.message,
  quotedMessageId: replyToWhatsAppMessageId,
});
const whatsappMessageId = result.whatsappMessageId;
```

Para a parte de media template pattern (`[IMAGE]url`), o mesmo principio se aplica: usar `provider.sendMedia()` e `provider.sendText()` em vez de chamadas diretas.

A logica de "Connection Closed" detection sera mantida apenas para Evolution (uazapi nao retorna esse erro especifico). Para uazapi, erros genericos serao tratados como falha de envio.

### send_media_async - Modificacao principal

O background task (`backgroundSendMedia`) tem dois caminhos: audio (sendWhatsAppAudio) e outros (sendMedia). Para uazapi, tudo passa por `provider.sendMedia()`:

```
// Para uazapi, simplifica tudo em:
const result = await provider.sendMedia(providerConfig, {
  number: targetNumber,
  mediaType: body.mediaType,
  mediaBase64: body.mediaBase64,
  mediaUrl: body.mediaUrl,
  fileName: body.fileName,
  caption: body.caption,
  mimeType: body.mimeType,
});
```

### get_media - Tratamento especial

Para uazapi, midias ja sao persistidas em Storage pelo webhook (`uazapi-webhook/index.ts`). O endpoint `get_media` retornara um erro informativo:

```
if (isUazapi(instance)) {
  return new Response(JSON.stringify({
    success: false,
    error: "Mídia não disponível para download via API. Verifique o Storage.",
  }), { status: 400 });
}
```

### Logica de fallback de Connection Closed

Apenas para Evolution: a logica de detectar "Connection Closed", forcar logout e marcar como desconectado sera encapsulada em um helper. Para uazapi, se o envio falhar, apenas marcar como falha.

## Arquivos Modificados

1. **`supabase/functions/evolution-api/index.ts`** - Adicionar provider detection em:
   - `send_message_async` (background task)
   - `send_media_async` (background task)
   - `send_message` (sync)
   - `send_media` (sync)
   - `get_media`
   - `delete_message`
   - `send_reaction`
   - `fetch_profile_picture`

2. **`supabase/functions/_shared/whatsapp-provider.ts`** - Adicionar:
   - `sendAudio()` especifico para Evolution (sendWhatsAppAudio endpoint)
   - `fetchProfilePicture()` para ambos os providers

## Ordem de Implementacao

1. Adicionar `sendAudio` e `fetchProfilePicture` ao whatsapp-provider.ts
2. Aplicar provider detection em `send_message` e `send_media` (sync - mais simples)
3. Aplicar provider detection em `send_message_async` (background task com media pattern)
4. Aplicar provider detection em `send_media_async` (background task com audio)
5. Aplicar provider detection em `delete_message`, `send_reaction`, `fetch_profile_picture`
6. Tratar `get_media` para uazapi
7. Deploy e teste

