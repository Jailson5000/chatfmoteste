

# Corrigir recebimento de midias, fotos de perfil e adicionar suporte a figurinhas e contatos

## Diagnostico real (confirmado pelos logs)

O payload real do uazapi tem esta estrutura (confirmado nos logs de producao):

```text
body = {
  EventType: "messages",
  chat: {
    phone: "+55 63 8462-2450",
    name: "Jailson Ferreira",
    imagePreview: "https://pps.whatsapp.net/...",   <-- FOTO DO PERFIL
    wa_lastMessageType: "DocumentMessage"
  },
  message: {                                        <-- body.message (NAO body.msg)
    type: "DocumentMessage",                        <-- PascalCase!
    content: {                                      <-- TUDO DENTRO DE content
      URL: "https://mmg.whatsapp.net/...enc...",
      mimetype: "application/pdf",
      fileName: "document.pdf",
      text: "rrr",                                  <-- texto fica aqui
      base64: "...",                                <-- base64 fica aqui
    },
    fromMe: false,
    id: "3EB0...",
    timestamp: 1771936645,
    pushName: "Jailson"
  }
}
```

O codigo atual faz `msg = body.msg || body.data || body.message || body` -- pega `body.message` corretamente. Porem TODAS as funcoes de extracao estao erradas porque buscam dados na raiz de `msg` (ex: `msg.text`, `msg.base64`, `msg.mimetype`), quando na verdade estao em `msg.content.text`, `msg.content.base64`, `msg.content.mimetype`.

Alem disso, `msg.type` e "DocumentMessage" (PascalCase), nao "document" (lowercase).

---

## Solucao

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

#### Correcao 1 -- detectMessageType: suportar PascalCase do uazapi

```typescript
function detectMessageType(msg: any): string {
  const t = (msg.type || "").toLowerCase();
  // uazapi sends PascalCase: "DocumentMessage", "ImageMessage", "StickerMessage", etc.
  if (t === "image" || t === "imagemessage" || msg.imageMessage) return "image";
  if (t === "video" || t === "videomessage" || msg.videoMessage) return "video";
  if (t === "audio" || t === "audiomessage" || t === "ptt" || t === "pttmessage" || t === "myaudio" || msg.audioMessage) return "audio";
  if (t === "document" || t === "documentmessage" || msg.documentMessage) return "document";
  if (t === "sticker" || t === "stickermessage" || msg.stickerMessage) return "sticker";
  if (t === "location" || t === "locationmessage" || msg.locationMessage) return "location";
  if (t === "contact" || t === "contactmessage" || t === "contactcardmessage" || msg.contactMessage || msg.contactsArrayMessage) return "contact";
  return "text";
}
```

#### Correcao 2 -- extractContent: buscar em msg.content

```typescript
function extractContent(msg: any): string {
  // Direct text at msg level
  if (msg.text) return msg.text;
  if (msg.body) return msg.body;
  if (msg.conversation) return msg.conversation;
  
  // uazapi: content is an object with the actual data
  const c = msg.content;
  if (c && typeof c === "object") {
    if (c.text) return c.text;
    if (c.caption) return c.caption;
    if (c.conversation) return c.conversation;
    // ExtendedTextMessage
    if (c.extendedTextMessage?.text) return c.extendedTextMessage.text;
  }
  
  // Fallback: content as string
  if (typeof msg.content === "string") return msg.content;
  
  // Extended text
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  
  // Media captions
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;
  if (msg.documentMessage?.caption) return msg.documentMessage.caption;
  if (msg.caption) return msg.caption;
  
  return "";
}
```

#### Correcao 3 -- extractMediaUrl: buscar URL em msg.content

```typescript
function extractMediaUrl(msg: any): string | null {
  // uazapi: media URL inside msg.content
  const c = msg.content;
  if (c && typeof c === "object") {
    if (c.URL) return c.URL;
    if (c.url) return c.url;
    if (c.mediaUrl) return c.mediaUrl;
  }
  
  // Direct URL fields
  if (msg.mediaUrl) return msg.mediaUrl;
  if (msg.url) return msg.url;
  if (msg.file && typeof msg.file === "string" && msg.file.startsWith("http")) return msg.file;
  
  // Nested type-specific messages
  if (msg.imageMessage?.url) return msg.imageMessage.url;
  // ... (keep existing)
  
  return null;
}
```

#### Correcao 4 -- extractMimeType: buscar em msg.content

```typescript
function extractMimeType(msg: any): string | null {
  // uazapi: nested in content
  const c = msg.content;
  if (c && typeof c === "object" && c.mimetype) return c.mimetype;
  
  if (msg.mimetype) return msg.mimetype;
  // ... (keep existing nested)
  return null;
}
```

#### Correcao 5 -- extractFileName: buscar em msg.content

```typescript
function extractFileName(msg: any): string | null {
  const c = msg.content;
  if (c && typeof c === "object" && c.fileName) return c.fileName;
  
  if (msg.fileName) return msg.fileName;
  if (msg.documentMessage?.fileName) return msg.documentMessage.fileName;
  return null;
}
```

#### Correcao 6 -- base64 extraction: buscar em msg.content

Na secao de persistencia de base64 (linha ~540), adicionar `msg.content?.base64`:
```typescript
const c = msg.content;
const rawBase64 = (c && typeof c === "object" ? c.base64 : null)
  || msg.base64 || body.base64 
  || (msg.file && typeof msg.file === "string" && !msg.file.startsWith("http") ? msg.file : null)
  || msg.imageMessage?.base64 || ...
```

#### Correcao 7 -- Extrair messageId e timestamp de msg corretamente

```typescript
const whatsappMessageId = msg.id || msg.key?.id || msg.messageId || crypto.randomUUID();
const rawTs = Number(msg.timestamp || msg.messageTimestamp);
```

#### Correcao 8 -- Salvar foto de perfil do chat.imagePreview

Apos criar ou encontrar o cliente, verificar se `chat.imagePreview` existe e o cliente nao tem `avatar_url`. Se sim, baixar e persistir no Storage:

```typescript
// After client creation/update section
if (!isFromMe && chat.imagePreview && typeof chat.imagePreview === "string" && chat.imagePreview.startsWith("http")) {
  // Background: persist profile picture
  const clientId = existingClient?.id || newClient?.id;
  if (clientId) {
    persistProfilePicture(supabaseClient, clientId, lawFirmId, chat.imagePreview).catch(() => {});
  }
}
```

Nova funcao auxiliar `persistProfilePicture`:
```typescript
async function persistProfilePicture(supabaseClient, clientId, lawFirmId, imageUrl) {
  // Check if client already has avatar
  const { data: client } = await supabaseClient.from("clients").select("avatar_url").eq("id", clientId).single();
  if (client?.avatar_url) return; // Already has avatar
  
  // Download and upload to Storage
  const response = await fetch(imageUrl);
  if (!response.ok) return;
  const bytes = new Uint8Array(await response.arrayBuffer());
  const storagePath = `${lawFirmId}/avatars/${clientId}.jpg`;
  
  await supabaseClient.storage.from("chat-media").upload(storagePath, bytes, {
    contentType: "image/jpeg", upsert: true
  });
  
  const { data } = supabaseClient.storage.from("chat-media").getPublicUrl(storagePath);
  if (data?.publicUrl) {
    await supabaseClient.from("clients").update({ avatar_url: data.publicUrl }).eq("id", clientId);
  }
}
```

#### Correcao 9 -- Suporte a figurinhas (sticker)

A deteccao de tipo ja inclui "stickermessage". No banco, `message_type = "sticker"` sera salvo. A URL sera extraida de `msg.content.URL` e o base64 de `msg.content.base64`. A extensao `.webp` sera adicionada ao extMap:
```typescript
"image/webp": ".webp",
```

---

### Arquivo: `supabase/functions/_shared/whatsapp-provider.ts`

#### Correcao 10 -- sendContact para uazapi

Adicionar tipo e metodo `sendContact` ao UazapiProvider:

```typescript
// Novo tipo
export interface SendContactOptions {
  number: string;
  fullName: string;
  phoneNumber: string;  // pode ter multiplos separados por virgula
  organization?: string;
  email?: string;
  url?: string;
}

// No UazapiProvider
async sendContact(config: ProviderConfig, opts: SendContactOptions): Promise<SendTextResult> {
  const apiUrl = normalizeUrl(config.apiUrl);
  const payload = {
    number: opts.number,
    fullName: opts.fullName,
    phoneNumber: opts.phoneNumber,
    organization: opts.organization || "",
    email: opts.email || "",
    url: opts.url || "",
  };
  
  const res = await fetchWithTimeout(`${apiUrl}/send/contact`, {
    method: "POST",
    headers: { token: config.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, SEND_TIMEOUT_MS);
  
  if (!res.ok) throw new Error(`Falha ao enviar contato (${res.status})`);
  const data = await res.json().catch(() => ({}));
  return { success: true, whatsappMessageId: data?.key?.id || null, raw: data };
}
```

Adicionar export na API publica e tambem no EvolutionProvider (como no-op ou adaptacao).

#### Correcao 11 -- fetchProfilePicture: usar endpoint correto

O UazapiProvider.fetchProfilePicture usa `/contacts/profile-picture` mas a docs mostra `/profile/image` para alterar. Para BUSCAR foto do contato, o endpoint correto e `POST /profile/image` com `jid`. Na verdade, vou usar a API correta que e `POST /business/get/profile` para perfil comercial e para foto de contato, a foto ja vem no webhook via `chat.imagePreview`. Mantemos o endpoint existente como fallback.

---

### Arquivo: `supabase/functions/evolution-api/index.ts`

#### Correcao 12 -- Expor sendContact como action

Adicionar `"send_contact"` a lista de actions e implementar o handler que chama o provider.

---

## Resumo de mudancas

| Arquivo | Mudanca | Impacto |
|---|---|---|
| `uazapi-webhook/index.ts` | Corrigir extractors para buscar em `msg.content` | **CRITICO** -- corrige 100% das midias |
| `uazapi-webhook/index.ts` | detectMessageType suportar PascalCase | Documentos, stickers, audios reconhecidos |
| `uazapi-webhook/index.ts` | Persistir foto de perfil de `chat.imagePreview` | Avatares dos contatos aparecem |
| `uazapi-webhook/index.ts` | Adicionar `.webp` ao extMap para stickers | Figurinhas salvas corretamente |
| `whatsapp-provider.ts` | Adicionar `sendContact` | Enviar cartoes de contato via WhatsApp |
| `evolution-api/index.ts` | Expor action `send_contact` | Frontend pode enviar contatos |

## Resultado esperado

- PDFs, imagens, videos, audios e figurinhas do WhatsApp chegarao na plataforma
- Fotos de perfil serao salvas automaticamente no primeiro contato
- Contatos poderao ser enviados via WhatsApp
- Stickers serao exibidos como imagens na conversa

