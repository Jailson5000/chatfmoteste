

# Audios da IA Nao Chegam no WhatsApp (uazapi)

## Diagnostico

A analise dos logs e do codigo revelou o problema raiz:

### MIME Type Incorreto no Envio

O TTS (ElevenLabs) gera audio em formato **OGG/Opus** (`audio/ogg; codecs=opus`), confirmado nos logs:
```
[TTS-ElevenLabs] SUCCESS: Audio generated in format opus_48000_128
[TTS] ElevenLabs SUCCESS with mimeType: audio/ogg; codecs=opus
```

Porem, o codigo no `uazapi-webhook` HARDCODA o MIME type como `audio/mpeg` na data URI:
```typescript
// Linha 1634 - BUG: MIME hardcodado como mpeg, mas o conteudo e OGG
audio: `data:audio/mpeg;base64,${ttsData.audioContent}`,
```

Resultado: o uazapi recebe um arquivo que diz ser MP3 mas na verdade e OGG. Isso causa falha na decodificacao e o audio nao e entregue ao WhatsApp.

### Evidencias da Falha

- **whatsapp_message_id** das ultimas mensagens audio sao UUIDs (`e6abf8fb-...`, `0efb1e64-...`) - fallback de `crypto.randomUUID()`, indicando que o uazapi NAO retornou um ID de mensagem real
- **Nenhum log** do resultado do envio - o `audioSendRes` nao e logado, impossibilitando diagnostico
- Audios de instancias Evolution API funcionam (IDs reais tipo `3EB0AF6D50AC38D215385E`) porque o `sendAudioToWhatsApp` usa o MIME correto

## Correcao

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

**1. Usar MIME type real do TTS na data URI** (linha 1634):
```typescript
// ANTES (bugado):
audio: `data:audio/mpeg;base64,${ttsData.audioContent}`,

// DEPOIS (correto):
const audioMime = (ttsData.mimeType || "audio/mpeg").split(";")[0].trim();
audio: `data:${audioMime};base64,${ttsData.audioContent}`,
```

**2. Adicionar logging detalhado da resposta do uazapi** (apos linha 1637):
```typescript
console.log("[UAZAPI_WEBHOOK] /send/audio response:", {
  status: audioSendRes.status,
  ok: audioSendRes.ok,
});
const audioSendData = await audioSendRes.json().catch(() => ({}));
console.log("[UAZAPI_WEBHOOK] /send/audio data:", JSON.stringify(audioSendData).slice(0, 500));
```

**3. Se o envio com OGG falhar, tentar com base64 puro** (sem data URI prefix):
Alguns provedores uazapi aceitam base64 puro sem o prefixo `data:...`:
```typescript
if (!audioSendRes.ok) {
  // Retry: enviar base64 puro sem data URI prefix
  const retryRes = await fetch(`${apiUrl}/send/audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: instance.api_key },
    body: JSON.stringify({
      number: targetNumber,
      audio: ttsData.audioContent,  // base64 puro
      ptt: true,
    }),
  });
  // ... parse response
}
```

## Resumo das Mudancas

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Corrigir MIME type na data URI; adicionar logging; fallback base64 puro |

## Resultado Esperado

1. Audio da IA chega no WhatsApp do cliente com formato correto (OGG/Opus)
2. Logs detalhados permitem diagnosticar problemas futuros
3. Fallback para base64 puro garante compatibilidade com diferentes versoes do uazapi

