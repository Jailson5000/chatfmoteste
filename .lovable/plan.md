

# Habilitar Download de Áudios Enviados pela IA

## Problema Identificado

Os áudios gerados pela IA (via ElevenLabs TTS) **não podem ser baixados** porque:

1. O áudio é gerado como base64 pelo ElevenLabs
2. É enviado diretamente ao WhatsApp via Evolution API
3. **Não é salvo em nenhum storage permanente**
4. O registro no banco tem `media_url = NULL`

**Comparação:**

| Tipo de Áudio | media_url | Como baixar |
|---------------|-----------|-------------|
| Cliente | `https://mmg.whatsapp.net/...` | Via `get_media` (descriptografar) |
| IA (TTS) | `NULL` ❌ | **Não é possível atualmente** |

---

## Solução Proposta

Salvar o áudio gerado pela IA no bucket `chat-media` antes de enviar ao WhatsApp, e persistir a URL no banco.

### Fluxo Corrigido

```text
┌────────────────────────────────────────────────────────────────┐
│                   GERAÇÃO DE ÁUDIO TTS                         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  1. ElevenLabs gera audioBase64                                │
│                       ↓                                        │
│  2. [NOVO] Upload do áudio para Supabase Storage               │
│     Bucket: chat-media                                         │
│     Path: {law_firm_id}/ai-audio/{message_id}.mp3              │
│                       ↓                                        │
│  3. Enviar audio ao WhatsApp (como já faz)                     │
│                       ↓                                        │
│  4. Salvar mensagem no banco COM media_url                     │
│     media_url: URL do arquivo no Storage                       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/evolution-webhook/index.ts` | Adicionar upload ao storage antes de salvar a mensagem |

---

## Seção Técnica

### Modificação no `sendAudioToWhatsApp` e fluxo de TTS

Após gerar o áudio com `generateTTSAudio()` e antes de salvar no banco, precisamos:

```typescript
// Após enviar o áudio com sucesso para o WhatsApp (linha ~2570-2585)

// [NOVO] Salvar áudio no Storage para permitir download posterior
let audioStorageUrl: string | null = null;
if (audioResult.success && audioResult.messageId && audioBase64) {
  try {
    // Converter base64 para Uint8Array
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Gerar nome do arquivo
    const fileName = `ai-audio/${audioResult.messageId}.mp3`;
    const storagePath = `${context.lawFirmId}/${fileName}`;

    // Upload para o bucket chat-media
    const { data: uploadData, error: uploadError } = await supabaseClient
      .storage
      .from('chat-media')
      .upload(storagePath, bytes, {
        contentType: 'audio/mpeg',
        cacheControl: '31536000', // 1 ano de cache
        upsert: false,
      });

    if (!uploadError && uploadData) {
      // Gerar URL pública (ou signed URL se bucket for privado)
      const { data: urlData } = await supabaseClient
        .storage
        .from('chat-media')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 ano

      audioStorageUrl = urlData?.signedUrl || null;
      
      logDebug('TTS_STORAGE', 'Audio saved to storage', {
        path: storagePath,
        hasUrl: !!audioStorageUrl,
      });
    }
  } catch (storageError) {
    logDebug('TTS_STORAGE', 'Failed to save audio to storage (non-blocking)', {
      error: storageError instanceof Error ? storageError.message : storageError,
    });
    // Não bloqueia o fluxo - áudio já foi enviado ao WhatsApp
  }
}

// Modificar o INSERT para incluir media_url
await supabaseClient
  .from('messages')
  .insert({
    conversation_id: context.conversationId,
    law_firm_id: context.lawFirmId,
    whatsapp_message_id: audioResult.messageId,
    content: chunkText,
    message_type: 'audio',
    is_from_me: true,
    sender_type: 'system',
    ai_generated: true,
    media_mime_type: 'audio/mpeg',
    media_url: audioStorageUrl,  // ← NOVO: URL do arquivo no Storage
    ai_agent_id: context.automationId || null,
    ai_agent_name: context.automationName || null,
  });
```

### RLS do Bucket

O bucket `chat-media` é **privado** e já possui RLS. A URL gerada via `createSignedUrl` permite acesso temporário sem autenticação.

### Frontend - Já Compatível

O componente `DecryptedMediaListItem` já verifica:
```typescript
const needsDecryption = useMemo(() => {
  return !!whatsappMessageId;
}, [whatsappMessageId]);
```

Com a correção, áudios da IA terão `media_url` preenchida, e o sistema poderá:
1. Verificar que `media_url` existe e é uma URL válida do Storage
2. Abrir diretamente sem precisar descriptografar

**Ajuste adicional no frontend** (opcional, mas recomendado):

```typescript
const needsDecryption = useMemo(() => {
  // Se tem media_url válida (não é .enc ou mmg.whatsapp.net), não precisa descriptografar
  if (mediaUrl && !isEncryptedMediaUrl(mediaUrl)) {
    return false;
  }
  return !!whatsappMessageId;
}, [whatsappMessageId, mediaUrl]);
```

---

## Análise de Risco

| Aspecto | Risco | Justificativa |
|---------|-------|---------------|
| Storage adicional | **BAIXO** | ~50KB por áudio, cleanup pode ser implementado depois |
| Performance | **BAIXO** | Upload assíncrono, não bloqueia envio |
| Custo | **MÍNIMO** | Storage é barato, áudios são pequenos |
| Fallback | **SEGURO** | Se upload falhar, áudio ainda é enviado ao WhatsApp |

---

## Resultado Esperado

Após a implementação:

1. Áudios da IA terão `media_url` preenchida com URL do Supabase Storage
2. O frontend poderá baixar áudios da IA da mesma forma que baixa documentos
3. Áudios antigos continuarão sem `media_url` (comportamento atual)

