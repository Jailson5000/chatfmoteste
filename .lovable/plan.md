
## Corrigir Persistencia de Midias do WhatsApp (Evolution API)

### Problema Identificado

Quando um cliente envia um arquivo (documento, imagem, video, audio) pelo WhatsApp, o sistema salva a URL temporaria do CDN do WhatsApp (`mmg.whatsapp.net/.../.enc`) diretamente no campo `media_url` da mensagem. Essa URL expira em aproximadamente 48 horas.

Apos a expiracao, o sistema tenta baixar via Evolution API (`getBase64FromMediaMessage`), mas isso tambem falha porque o WhatsApp ja apagou a midia do servidor. Resultado: "Documento nao disponivel".

O webhook do Meta (Instagram/Facebook) **ja faz** a persistencia corretamente - baixa a midia e salva no bucket `chat-media` do Storage. O webhook da Evolution API **nao faz isso**.

### Solucao

Adicionar logica de persistencia de midia no `evolution-webhook`, similar ao que ja existe no `meta-webhook`. Apos receber uma mensagem com midia, o webhook vai:

1. Chamar a Evolution API para obter o base64 da midia (`getBase64FromMediaMessage`)
2. Fazer upload para o bucket `chat-media` do Storage
3. Substituir a URL temporaria pela URL publica permanente antes de salvar no banco

### Detalhes Tecnicos

**Arquivo: `supabase/functions/evolution-webhook/index.ts`**

Adicionar uma funcao auxiliar `persistMediaToStorage` que:

```text
async function persistMediaToStorage(supabaseClient, params) {
  // 1. Obter base64 via Evolution API (getBase64FromMediaMessage)
  // 2. Converter base64 para Uint8Array
  // 3. Upload para chat-media/{lawFirmId}/{conversationId}/{safeMessageId}.{ext}
  // 4. Retornar URL publica do Storage
}
```

Chamar esta funcao **apos** determinar o tipo da midia e **antes** de inserir a mensagem no banco (linhas ~5430-5540). O fluxo sera:

```text
// Apos extrair mediaUrl, mediaMimeType, messageType
// e apos ter o conversation.id e instance

if (mediaUrl && ['image','document','audio','video','ptt','sticker'].includes(messageType)) {
  const persistedUrl = await persistMediaToStorage(
    supabaseClient, evolutionBaseUrl, evolutionApiKey, 
    instance.instance_name, data.key, data.message,
    conversation.law_firm_id, conversation.id, data.key.id,
    mediaMimeType
  );
  if (persistedUrl) {
    mediaUrl = persistedUrl; // URL permanente substitui a temporaria
  }
  // Se falhar, mantemos a URL original como fallback
}
```

A persistencia sera feita em **background-safe** mode:
- Se falhar, a mensagem ainda sera salva com a URL temporaria (comportamento atual)
- Timeout de 15 segundos para nao atrasar o processamento
- Log de warning se a persistencia falhar

**Extensoes de arquivo** mapeadas pelo mimeType:
- `application/pdf` -> `.pdf`
- `image/jpeg` -> `.jpg`
- `image/png` -> `.png`
- `audio/ogg` -> `.ogg`
- `video/mp4` -> `.mp4`
- etc.

### Impacto

- Todas as midias recebidas via WhatsApp (Evolution API) serao automaticamente persistidas no Storage
- Midias antigas (ja com URL expirada) continuam inacessiveis - a correcao afeta apenas novas mensagens
- Downloads e visualizacoes funcionarao permanentemente, sem depender do CDN do WhatsApp
- Para midias antigas, o fallback de descriptografia via Evolution API continua disponivel (funciona enquanto a sessao do WhatsApp tiver a mensagem em cache)

### Arquivo editado

- `supabase/functions/evolution-webhook/index.ts`
