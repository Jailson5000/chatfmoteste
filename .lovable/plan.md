

# Corrigir persistencia de midia enviada e exibicao

## Problema raiz

Ao enviar midia (imagem, documento, audio), o sistema:
1. Envia o base64 para o WhatsApp via uazapi -- **funciona** (as midias chegam no WhatsApp)
2. Mas **NAO salva o base64 no Storage** -- entao `media_url` fica `null` no banco
3. Resultado: imagens mostram "Imagem nao disponivel", documentos mostram UUID em vez do nome, audios nao tocam

Confirmacao via banco de dados -- TODAS as midias enviadas recentemente tem `media_url: null`:
```text
[Imagem]   media_url: null  status: sent
[document] media_url: null  status: sent
[Audio]    media_url: null  status: sent
```

As midias chegam no WhatsApp (confirmado pelos screenshots), mas nao sao visiveis na interface do MiauChat.

## Solucao

### Arquivo: `supabase/functions/evolution-api/index.ts` (funcao backgroundSendMedia)

**Mudanca principal**: Apos enviar com sucesso, salvar o base64 no bucket `chat-media` do Storage e atualizar `media_url` com a URL publica.

Dentro da funcao `backgroundSendMedia` (linha ~3473), apos o envio bem-sucedido e antes do update da mensagem:

1. Se `body.mediaBase64` existe e `extractedMediaUrl` e null (caso uazapi que nao retorna URL):
   - Determinar extensao do arquivo pelo mimeType
   - Fazer upload do base64 para `chat-media/{conversationId}/{tempMessageId}.{ext}`
   - Obter URL publica do Storage
   - Usar essa URL como `media_url` no update da mensagem

2. Tambem garantir que `body.fileName` seja preservado no `content` do documento (em vez de UUID)

```typescript
// Apos envio bem-sucedido, persistir midia no Storage se nao tiver URL
if (!extractedMediaUrl && body.mediaBase64 && conversationId) {
  try {
    const ext = getExtFromMime(body.mimeType || "application/octet-stream");
    const storagePath = `${conversationId}/${tempMessageId}.${ext}`;
    
    // Decode base64 to Uint8Array
    const binaryStr = atob(body.mediaBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    
    const { error: uploadError } = await supabaseClient.storage
      .from("chat-media")
      .upload(storagePath, bytes, {
        contentType: body.mimeType || "application/octet-stream",
        upsert: true,
      });
    
    if (!uploadError) {
      const { data: urlData } = supabaseClient.storage
        .from("chat-media")
        .getPublicUrl(storagePath);
      extractedMediaUrl = urlData?.publicUrl || null;
    }
  } catch (storageErr) {
    console.warn("[Evolution API] Failed to persist media to storage:", storageErr);
  }
}
```

3. Garantir que o `content` do documento mostre o nome real do arquivo:

No update da mensagem (linha ~3476), adicionar logica para documentos:
```typescript
const displayContent = body.mediaType === "document" && body.fileName
  ? `[${body.fileName}]`
  : (body.caption || mediaTypeDisplay);
```

### Funcao auxiliar `getExtFromMime`

Adicionar funcao simples no inicio da funcao ou inline:
```typescript
function getExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "audio/ogg": "ogg", "audio/webm": "webm", "audio/mpeg": "mp3",
    "video/mp4": "mp4", "application/pdf": "pdf",
  };
  return map[mime.split(";")[0]] || "bin";
}
```

## Resumo de mudancas

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/evolution-api/index.ts` | Salvar base64 no Storage apos envio bem-sucedido |
| | Usar URL do Storage como `media_url` da mensagem |
| | Mostrar nome real do arquivo em vez de UUID para documentos |

## Resultado esperado

- Imagens enviadas ficarao visiveis na interface (URL do Storage)
- Documentos mostrarao o nome correto do arquivo
- Audios enviados terao URL para reproduzir
- Tudo sera persistido permanentemente no Storage
