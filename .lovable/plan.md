

# Corrigir envio e recebimento de midia via uazapi

## Problemas identificados

### 1. Envio de midia falha: campo `file` ausente
Os logs mostram claramente:
```
Background media send error: Error: Falha ao enviar midia (500): {"error":"missing file field"}
```

O `UazapiProvider.sendMedia` envia os campos `base64` e `url`, mas a API do uazapi espera o campo `file` para midia. Isso afeta **todos os tipos de midia**: imagens, documentos, videos e audios.

### 2. Envio de audio usa endpoint errado
O `UazapiProvider.sendAudio` simplesmente redireciona para `sendMedia` com `mediaType: 'audio'`. Para audios PTT (gravados), o uazapi tem endpoint especifico `/send/audio` com campos diferentes (`audio` em vez de `file`).

### 3. Conversas antigas com numero errado ainda tentam enviar
Conversas criadas antes da correcao do telefone ainda tem `remote_jid: "60688537@s.whatsapp.net"` e falham:
```
the number 60688537@s.whatsapp.net is not on WhatsApp
```

## Solucao

### Arquivo: `supabase/functions/_shared/whatsapp-provider.ts`

**Correcao 1 -- Campo `file` no sendMedia (linhas 554-594)**

O payload do `UazapiProvider.sendMedia` precisa usar `file` em vez de `base64`/`url`:

Antes:
```typescript
if (opts.mediaBase64) {
  payload.base64 = opts.mediaBase64;
  payload.mimetype = opts.mimeType || "application/octet-stream";
} else if (opts.mediaUrl) {
  payload.url = opts.mediaUrl;
}
```

Depois:
```typescript
if (opts.mediaBase64) {
  payload.file = opts.mediaBase64;
  payload.mimetype = opts.mimeType || "application/octet-stream";
} else if (opts.mediaUrl) {
  payload.file = opts.mediaUrl;
}
```

A API do uazapi aceita tanto URL quanto base64 no campo `file`.

**Correcao 2 -- Endpoint e payload de audio (linhas 836-844)**

Para audios PTT (voz), usar endpoint `/send/audio` com campo `audio` e flag `ptt`:

Antes:
```typescript
async sendAudio(config: ProviderConfig, opts: SendAudioOptions): Promise<SendMediaResult> {
  return UazapiProvider.sendMedia(config, {
    number: opts.number,
    mediaType: 'audio',
    mediaBase64: opts.audioBase64,
    mimeType: opts.mimeType || 'audio/ogg',
  });
}
```

Depois:
```typescript
async sendAudio(config: ProviderConfig, opts: SendAudioOptions): Promise<SendMediaResult> {
  const apiUrl = normalizeUrl(config.apiUrl);

  const payload = {
    number: opts.number,
    audio: opts.audioBase64,
    ptt: true,
    mimetype: opts.mimeType || "audio/ogg;codecs=opus",
  };

  const res = await fetchWithTimeout(
    `${apiUrl}/send/audio`,
    {
      method: "POST",
      headers: {
        token: config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    SEND_TIMEOUT_MS,
  );

  if (!res.ok) {
    // Fallback: tentar /send/media com campo file
    return UazapiProvider.sendMedia(config, {
      number: opts.number,
      mediaType: 'audio',
      mediaBase64: opts.audioBase64,
      mimeType: opts.mimeType || 'audio/ogg',
      ptt: true,
    });
  }

  const data = await res.json().catch(() => ({}));
  const whatsappMessageId = data?.key?.id || data?.id || data?.messageId || null;
  return { success: true, whatsappMessageId, raw: data };
}
```

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

**Correcao 3 -- Persistir midia recebida no Storage**

Atualmente o webhook salva apenas a URL da midia que vem do uazapi. Se o uazapi envia base64 diretamente no payload (campo `msg.base64` ou `body.base64`), essa midia precisa ser salva no bucket `chat-media` para persistencia. Adicionar logica para extrair base64 do payload e salvar no Storage quando disponivel, seguindo o mesmo padrao do `evolution-webhook`.

**Correcao 4 -- Log de debug para midia recebida**

Adicionar log dos campos de midia do payload para verificar se base64, URL, mimetype e fileName estao sendo extraidos corretamente.

## Resumo de mudancas

| Arquivo | Mudanca |
|---|---|
| `_shared/whatsapp-provider.ts` | Trocar `base64`/`url` por `file` no sendMedia do uazapi |
| `_shared/whatsapp-provider.ts` | Implementar endpoint `/send/audio` dedicado para PTT |
| `uazapi-webhook/index.ts` | Persistir midia recebida (base64) no Storage |
| `uazapi-webhook/index.ts` | Logs de debug para campos de midia |

## Resultado esperado

- Documentos, imagens, videos e audios serao enviados com sucesso via uazapi
- Audios gravados serao enviados como PTT (voz) corretamente
- Midias recebidas serao persistidas no Storage para acesso futuro

