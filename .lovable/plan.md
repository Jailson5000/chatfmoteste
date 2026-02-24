

# Corrigir recebimento de arquivos do WhatsApp via uazapi

## Problema raiz identificado

Os logs mostram que **todas as midias recebidas** do WhatsApp estao sendo classificadas como `text` com conteudo vazio:

```
Message: text from 556384622450 (fromMe: false) {
  contentPreview: "",
  hasMedia: false,
  hasBase64: false,
  mimeType: null,
  fileName: null
}
```

A causa esta na linha 325 do `uazapi-webhook/index.ts`:
```typescript
const msg = body.data || body.message || body;
```

O payload real do uazapi tem a estrutura:
```json
{
  "BaseUrl": "https://miauchat.uazapi.com",
  "EventType": "messages",
  "chat": { "phone": "+55 63 ...", "name": "..." },
  "msg": { "type": "document", "base64": "...", "mimetype": "application/pdf", "fileName": "..." }
}
```

O campo `body.msg` **nunca e verificado**. O codigo cai em `body` (fallback), e como o body raiz nao tem `type`, `base64`, `imageMessage`, etc., tudo e classificado como texto vazio.

## Problema secundario no envio

A API do uazapi espera `docName` para nome de documento e `text` para caption, mas estamos enviando `fileName` e `caption`.

## Solucao

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

**Correcao 1 -- Extrair mensagem de `body.msg` (linha 325)**

Antes:
```typescript
const msg = body.data || body.message || body;
```

Depois:
```typescript
const msg = body.msg || body.data || body.message || body;
```

Isso garante que o objeto `msg` do uazapi (com `type`, `base64`, `mimetype`, `fileName`, etc.) seja usado corretamente.

**Correcao 2 -- Ampliar deteccao de tipo para campos uazapi (funcao `detectMessageType`)**

Adicionar verificacao do campo `msg.type` que o uazapi usa diretamente com valores como `"image"`, `"video"`, `"document"`, `"audio"`, `"ptt"`:

```typescript
function detectMessageType(msg: any): string {
  const t = (msg.type || "").toLowerCase();
  if (t === "image" || msg.imageMessage) return "image";
  if (t === "video" || msg.videoMessage) return "video";
  if (t === "audio" || t === "ptt" || t === "myaudio" || msg.audioMessage) return "audio";
  if (t === "document" || msg.documentMessage) return "document";
  if (t === "sticker" || msg.stickerMessage) return "sticker";
  if (t === "location" || msg.locationMessage) return "location";
  if (t === "contact" || msg.contactMessage || msg.contactsArrayMessage) return "contact";
  return "text";
}
```

**Correcao 3 -- Extrair base64, URL e nome do `msg` diretamente**

O uazapi coloca `base64`, `mimetype`, `file` (URL ou base64) e `fileName` diretamente no objeto `msg`. Atualizar as funcoes de extracao:

```typescript
// extractMediaUrl - adicionar campos do uazapi
function extractMediaUrl(msg: any): string | null {
  if (msg.mediaUrl) return msg.mediaUrl;
  if (msg.url) return msg.url;
  if (msg.file && typeof msg.file === "string" && msg.file.startsWith("http")) return msg.file;
  // ... nested fields existentes
  return null;
}
```

E para base64 na secao de persistencia (linha ~529), verificar tambem `msg.file` quando nao e URL:
```typescript
const rawBase64 = msg.base64 || body.base64
  || (msg.file && typeof msg.file === "string" && !msg.file.startsWith("http") ? msg.file : null)
  || msg.imageMessage?.base64 || msg.videoMessage?.base64
  || msg.audioMessage?.base64 || msg.documentMessage?.base64
  || msg.stickerMessage?.base64 || null;
```

**Correcao 4 -- Conteudo de documentos deve mostrar nome do arquivo**

Para mensagens de midia sem texto, mostrar tipo ou nome do arquivo:
```typescript
// Apos extrair content e messageType
let finalContent = content;
if (!finalContent && messageType !== "text") {
  if (fileName) finalContent = `[${fileName}]`;
  else finalContent = `[${messageType}]`;
}
messagePayload.content = finalContent || null;
```

**Correcao 5 -- Log do payload completo para debug**

Logar os primeiros 2000 chars em vez de 500 para capturar o `msg`:
```typescript
console.log(`[UAZAPI_WEBHOOK] Event: ${event}`, JSON.stringify(body).slice(0, 2000));
```

---

### Arquivo: `supabase/functions/_shared/whatsapp-provider.ts`

**Correcao 6 -- Campo `docName` em vez de `fileName` (linha 569-571)**

Conforme docs uazapi, o nome do documento e enviado como `docName`:
```typescript
if (opts.fileName) {
  payload.docName = opts.fileName;
}
```

**Correcao 7 -- Caption como `text` em vez de `caption` (linha 559)**

Conforme docs uazapi (`/send/media`), o campo de legenda e `text`, nao `caption`:
```typescript
const payload: Record<string, unknown> = {
  number: opts.number,
  type: opts.mediaType,
};
if (opts.caption) {
  payload.text = opts.caption;
}
```

---

## Resumo de mudancas

| Arquivo | Mudanca | Impacto |
|---|---|---|
| `uazapi-webhook/index.ts` | Extrair msg de `body.msg` | **Critico** -- corrige 100% dos arquivos nao recebidos |
| `uazapi-webhook/index.ts` | Ampliar deteccao de tipo (ptt, myaudio) | Audios de voz recebidos corretamente |
| `uazapi-webhook/index.ts` | Extrair base64 de `msg.file` | Midias persistidas no Storage |
| `uazapi-webhook/index.ts` | Conteudo padrao para midias | Documentos mostram nome correto |
| `whatsapp-provider.ts` | `docName` em vez de `fileName` | Nome correto no WhatsApp ao enviar |
| `whatsapp-provider.ts` | `text` em vez de `caption` | Legendas funcionam ao enviar |

## Resultado esperado

- PDFs, imagens, videos e audios enviados do WhatsApp chegarao na plataforma
- Midias serao persistidas no Storage com URL publica
- Documentos mostrarao o nome real do arquivo
- Envio de midias usara os campos corretos da API uazapi

