

# Correção: Endpoint Errado no Envio de Áudio via UAZAPi

## Problema Real (confirmado nos logs)

Os logs mostram claramente o erro:

```
/send/audio response: { status: 405, ok: false }
/send/audio data: {"code":405,"message":"Method Not Allowed.","data":{}}
/send/audio retry response: { status: 405, ok: false }
```

**O endpoint `/send/audio` NÃO EXISTE na UAZAPi.** Retorna 405 Method Not Allowed.

## Documentação UAZAPi (endpoint correto)

A documentação oficial (`/send/media`) especifica:

- **Endpoint**: `POST /send/media`
- **Parâmetros obrigatórios**:
  - `number`: número do destinatário
  - `type`: tipo de mídia — para áudio de voz deve ser `"ptt"` (Push-to-Talk)
  - `file`: URL ou base64 do arquivo
- **Parâmetro opcional**: `mimetype` (detectado automaticamente se omitido)

Exemplo correto para enviar áudio de voz:
```json
{
  "number": "5511999999999",
  "type": "ptt",
  "file": "data:audio/ogg;base64,AAAA..."
}
```

## Correção

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

Substituir TODAS as chamadas a `/send/audio` por `/send/media` com os parâmetros corretos:

```typescript
// ANTES (bugado - endpoint não existe):
const audioSendRes = await fetch(`${apiUrl}/send/audio`, {
  method: "POST",
  headers: { "Content-Type": "application/json", token: instance.api_key },
  body: JSON.stringify({
    number: targetNumber,
    audio: `data:${audioMime};base64,${ttsData.audioContent}`,
    ptt: true,
  }),
});

// DEPOIS (correto conforme docs UAZAPi):
const audioSendRes = await fetch(`${apiUrl}/send/media`, {
  method: "POST",
  headers: { "Content-Type": "application/json", token: instance.api_key },
  body: JSON.stringify({
    number: targetNumber,
    type: "ptt",
    file: `data:${audioMime};base64,${ttsData.audioContent}`,
    mimetype: audioMime,
  }),
});
```

O fallback (retry com base64 puro) também será atualizado para usar `/send/media`:

```typescript
// Fallback: enviar com type "audio" em vez de "ptt"
const retryRes = await fetch(`${apiUrl}/send/media`, {
  method: "POST",
  headers: { "Content-Type": "application/json", token: instance.api_key },
  body: JSON.stringify({
    number: targetNumber,
    type: "audio",
    file: `data:${audioMime};base64,${ttsData.audioContent}`,
    mimetype: audioMime,
  }),
});
```

## Resumo

| Problema | Causa | Correção |
|---|---|---|
| 405 Method Not Allowed | Endpoint `/send/audio` não existe na UAZAPi | Usar `/send/media` com `type: "ptt"` |
| Parâmetros errados | `audio` e `ptt` como campos | Usar `file` e `type` conforme docs |
| Fallback também falha | Mesmo endpoint errado | Fallback com `type: "audio"` via `/send/media` |

## Arquivo afetado

| Arquivo | Mudança |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Trocar `/send/audio` → `/send/media`; ajustar payload para `type`/`file`/`mimetype` |

