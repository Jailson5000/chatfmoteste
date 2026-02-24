

# Corrigir recebimento de midias do WhatsApp -- Diagnostico real dos logs de producao

## Problema confirmado pelos logs

Os logs de producao mostram **dois bugs criticos** que impedem o funcionamento de midias:

### Bug 1: `detectMessageType` retorna "text" para todas as midias

O uazapi envia `msg.type = "media"` (generico) para TODOS os tipos de midia, nao PascalCase como "DocumentMessage". A funcao `detectMessageType` nao reconhece "media" e retorna "text":

```text
Logs de producao:
Message: text from 556384622450 { mimeType: "application/pdf", msgType: "media" }
Message: text from 556384622450 { mimeType: "image/jpeg", msgType: "media" }
Message: text from 556384622450 { mimeType: "audio/ogg; codecs=opus", msgType: "media" }
Message: text from 556384622450 { mimeType: "image/webp", msgType: "media" }
```

Todas as midias ficam com `message_type = "text"` no banco.

### Bug 2: Midias nunca sao persistidas no Storage

O codigo na linha 641 faz: `if (rawBase64 && !mediaUrl)` -- so persiste quando ha base64 E nao ha URL. O uazapi envia `mediaUrl` (URL do CDN do WhatsApp) mas **sem base64** (`hasBase64: false` em todos os logs). Resultado: a URL do CDN do WhatsApp e salva diretamente no banco, mas essas URLs expiram em poucas horas. Depois disso, a plataforma mostra "Imagem nao disponivel" / "Audio nao disponivel".

Banco de dados confirma -- todas as `media_url` apontam para `mmg.whatsapp.net`:
```text
media_url: https://mmg.whatsapp.net/o1/v/t24/f2/m238/...  (EXPIRADA)
media_url: https://mmg.whatsapp.net/v/t62.7119-24/...      (EXPIRADA)
```

Nenhuma midia foi persistida no Storage.

---

## Solucao

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

#### Correcao 1 -- `detectMessageType`: tratar `type: "media"` inferindo do mimeType

Quando `msg.type = "media"`, usar o mimeType extraido para determinar o tipo real:

```typescript
function detectMessageType(msg: any): string {
  const t = (msg.type || "").toLowerCase();
  
  // uazapi sends generic "media" type - infer from mimeType
  if (t === "media") {
    const mime = extractMimeType(msg) || "";
    const mLower = mime.toLowerCase();
    if (mLower.startsWith("image/webp")) return "sticker";
    if (mLower.startsWith("image/")) return "image";
    if (mLower.startsWith("video/")) return "video";
    if (mLower.startsWith("audio/")) return "audio";
    return "document"; // PDFs, DOCX, etc.
  }
  
  // PascalCase types (keep existing)
  if (t === "image" || t === "imagemessage" || msg.imageMessage) return "image";
  if (t === "video" || t === "videomessage" || msg.videoMessage) return "video";
  if (t === "audio" || t === "audiomessage" || t === "ptt" || t === "pttmessage" || ...) return "audio";
  if (t === "document" || t === "documentmessage" || msg.documentMessage) return "document";
  if (t === "sticker" || t === "stickermessage" || msg.stickerMessage) return "sticker";
  if (t === "location" || t === "locationmessage" || ...) return "location";
  if (t === "contact" || t === "contactmessage" || ...) return "contact";
  if (t === "extendedtextmessage") return "text";
  return "text";
}
```

#### Correcao 2 -- Baixar midia da URL do WhatsApp e persistir no Storage

Apos o bloco de base64 (linha 641-683), adicionar um bloco que baixa a midia da URL quando base64 nao esta disponivel:

```typescript
// EXISTING: if (rawBase64 && !mediaUrl) { ... persist base64 ... }

// NEW: Download from WhatsApp CDN URL when no base64
const currentMediaUrl = messagePayload.media_url as string | null;
if (currentMediaUrl && 
    !currentMediaUrl.includes("supabase") && 
    messageType !== "text") {
  try {
    console.log("[UAZAPI_WEBHOOK] Downloading media from CDN URL:", currentMediaUrl.slice(0, 100));
    const response = await fetch(currentMediaUrl);
    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 100) { // Valid file
        const baseMime = (mimeType || "").split(";")[0].trim().toLowerCase();
        const ext = extMap[baseMime] || extMap[mimeType || ""] || ".bin";
        const storagePath = `${lawFirmId}/${conversationId}/${whatsappMessageId}${ext}`;
        
        const { error: uploadError } = await supabaseClient.storage
          .from("chat-media")
          .upload(storagePath, bytes, {
            contentType: baseMime || "application/octet-stream",
            upsert: true,
          });
        
        if (!uploadError) {
          const { data: publicUrlData } = supabaseClient.storage
            .from("chat-media")
            .getPublicUrl(storagePath);
          if (publicUrlData?.publicUrl) {
            messagePayload.media_url = publicUrlData.publicUrl;
            console.log("[UAZAPI_WEBHOOK] Media downloaded and persisted:", storagePath);
          }
        }
      }
    }
  } catch (dlErr) {
    console.warn("[UAZAPI_WEBHOOK] CDN download failed (will use original URL):", dlErr);
  }
}
```

#### Correcao 3 -- Mover `extMap` para escopo acessivel

O `extMap` atualmente esta dentro do bloco `if (rawBase64 && !mediaUrl)`. Precisa ser movido para antes dos dois blocos (base64 e download) para ser reutilizado.

#### Correcao 4 -- Usar `chat.wa_lastMessageType` como fallback para tipo

O payload do uazapi inclui `body.chat.wa_lastMessageType` com o tipo correto em PascalCase (ex: "DocumentMessage", "ImageMessage"). Usar como fallback quando `msg.type = "media"`:

```typescript
// Na funcao detectMessageType, aceitar segundo parametro opcional:
function detectMessageType(msg: any, chat?: any): string {
  let t = (msg.type || "").toLowerCase();
  
  // uazapi sends "media" as generic type - try chat.wa_lastMessageType first
  if (t === "media" && chat?.wa_lastMessageType) {
    t = chat.wa_lastMessageType.toLowerCase();
  }
  // ... rest of function
```

---

## Resumo de mudancas

| Mudanca | Impacto |
|---|---|
| `detectMessageType`: tratar `type: "media"` via mimeType + `wa_lastMessageType` | Imagens, audios, PDFs e figurinhas classificados corretamente |
| Download de midia da URL do CDN do WhatsApp | Midias persistidas no Storage com URL permanente |
| Mover `extMap` para escopo compartilhado | Base64 e download usam o mesmo mapeamento de extensoes |

## Resultado esperado

- Imagens aparecerao na conversa (persistidas no Storage)
- Audios serao reproduziveis (URL permanente em vez de CDN expirado)
- PDFs e documentos serao visualizaveis e baixaveis
- Figurinhas (.webp) serao exibidas corretamente
- Fotos de perfil continuam sendo capturadas do `chat.imagePreview`

