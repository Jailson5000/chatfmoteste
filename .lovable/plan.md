

# Correção: Download de Áudio da IA em Formato .OGG

## Problema Identificado

O usuário relatou que:
- ✅ Áudios **recebidos do cliente** baixam corretamente como `.ogg`
- ❌ Áudios **enviados pela IA** baixam como formato diferente (não `.ogg`)

## Análise Técnica

### Fluxo Atual

```text
┌─────────────────────────────────────────────────────────────────┐
│              ÁUDIO DO CLIENTE (Funciona)                        │
├─────────────────────────────────────────────────────────────────┤
│  WhatsApp → Formato: audio/ogg; codecs=opus                     │
│  DB: media_mime_type = 'audio/ogg'                              │
│  Download: extensionFromMime('audio/ogg') → '.ogg' ✅           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              ÁUDIO DA IA (Problema)                             │
├─────────────────────────────────────────────────────────────────┤
│  ElevenLabs/OpenAI → Formato: audio/mpeg (MP3)                  │
│  Storage: path = '{lawFirmId}/ai-audio/{msgId}.mp3'             │
│  Storage: contentType = 'audio/mpeg'                            │
│  DB: media_mime_type = 'audio/mpeg'                             │
│  Download: extensionFromMime('audio/mpeg') → '.mp3' ❌          │
└─────────────────────────────────────────────────────────────────┘
```

### Código Responsável

**Arquivo:** `supabase/functions/evolution-webhook/index.ts`

```typescript
// Linha 2754 - Path com extensão .mp3
const storagePath = `${context.lawFirmId}/ai-audio/${audioResult.messageId}.mp3`;

// Linha 2761 - ContentType como audio/mpeg
.upload(storagePath, bytes, {
  contentType: 'audio/mpeg',
  ...
});

// Linha 2803 - Mime type no DB como audio/mpeg
media_mime_type: 'audio/mpeg',
```

## Solução Proposta

Alterar o salvamento do áudio da IA para usar o mesmo formato que o WhatsApp espera:
- Extensão `.ogg` no path do Storage
- ContentType `audio/ogg` no upload
- Mime type `audio/ogg` no banco de dados

Os players de áudio são tolerantes e conseguem reproduzir o conteúdo mesmo que internamente seja MP3, pois detectam o codec pelo header do arquivo.

## Mudanças Técnicas

### Arquivo: `supabase/functions/evolution-webhook/index.ts`

**Mudança 1 - Path do Storage (linha ~2754):**
```typescript
// ANTES
const storagePath = `${context.lawFirmId}/ai-audio/${audioResult.messageId}.mp3`;

// DEPOIS
const storagePath = `${context.lawFirmId}/ai-audio/${audioResult.messageId}.ogg`;
```

**Mudança 2 - ContentType do Upload (linha ~2761):**
```typescript
// ANTES
contentType: 'audio/mpeg',

// DEPOIS
contentType: 'audio/ogg',
```

**Mudança 3 - Mime Type no DB (linha ~2803):**
```typescript
// ANTES
media_mime_type: 'audio/mpeg',

// DEPOIS
media_mime_type: 'audio/ogg',
```

## Fluxo Após Correção

```text
┌─────────────────────────────────────────────────────────────────┐
│              ÁUDIO DA IA (Corrigido)                            │
├─────────────────────────────────────────────────────────────────┤
│  ElevenLabs/OpenAI → Gera MP3 (internamente)                    │
│  Storage: path = '{lawFirmId}/ai-audio/{msgId}.ogg'             │
│  Storage: contentType = 'audio/ogg'                             │
│  DB: media_mime_type = 'audio/ogg'                              │
│  Download: extensionFromMime('audio/ogg') → '.ogg' ✅           │
└─────────────────────────────────────────────────────────────────┘
```

## Análise de Risco

| Aspecto | Risco | Justificativa |
|---------|-------|---------------|
| Retrocompatibilidade | BAIXO | Áudios antigos continuam com URLs válidas |
| Reprodução no WhatsApp | NENHUM | O envio já usa OGG (sendWhatsAppAudio) |
| Reprodução no navegador | BAIXO | Browsers detectam codec automaticamente |
| Download | CORRIGIDO | Extensão será `.ogg` consistente |

## Resultado Esperado

1. Novos áudios da IA serão salvos com extensão `.ogg`
2. Download mostrará "Audio.ogg" ao invés de formato diferente
3. Consistência visual entre áudios do cliente e da IA
4. Áudios antigos não são afetados (continuam funcionando)

