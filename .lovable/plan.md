

# Analise de Contagem de Consumos — CONCLUÍDO

## Correções Implementadas

### ✅ Correção 1: Transcrição de Áudio no uazapi-webhook (CRÍTICO)
**Status: IMPLEMENTADO**

- Quando o cliente envia áudio via uazapi, o sistema agora:
  1. Baixa o áudio persistido no Storage (ou via `/message/download` como fallback)
  2. Converte para base64 e chama `transcribe-audio` (Whisper)
  3. Atualiza o conteúdo da mensagem no banco com `[Áudio transcrito]: ...`
  4. Envia a transcrição para a IA processar (em vez de `[audio]`)

### ✅ Correção 2: Respostas em Áudio (TTS) no uazapi-webhook (CRÍTICO)
**Status: IMPLEMENTADO**

- Quando `ai_audio_enabled = true` na conversa, o uazapi-webhook agora:
  1. Resolve a voz configurada (agente → empresa → default `el_laura`)
  2. Gera áudio TTS via `ai-text-to-speech` com `skipUsageTracking: true`
  3. Envia o áudio via uazapi `/send/audio` com `ptt: true`
  4. Persiste o áudio no Storage com URL assinada
  5. Salva a mensagem no banco como `message_type: "audio"`
  6. Registra uso TTS em `usage_records` (com `duration_seconds` estimado)
  7. Se TTS falha, faz fallback automático para resposta em texto

### ✅ Correção 3: Preview TTS não contabilizar (BAIXO)
**Status: IMPLEMENTADO**

- `AIVoiceSettings.tsx` agora passa `skipUsageTracking: true` ao testar vozes

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Transcrição de áudio + respostas TTS |
| `src/components/settings/AIVoiceSettings.tsx` | `skipUsageTracking: true` em previews |
