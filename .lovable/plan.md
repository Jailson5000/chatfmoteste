

# Analise de Contagem de Consumos — Diagnostico Completo

## Estado Atual dos Rastreamentos

### 1. Conversas de IA — OK
- `ai-chat/index.ts` registra 1 conversa unica por periodo de faturamento via `recordAIConversationUsage`
- Ambos os webhooks (uazapi e evolution) chamam `ai-chat`, que faz o tracking
- Dados reais: 543 conversas em fev/2026, 542 com source=whatsapp
- Deduplicacao por `conversation_id + billing_period` funciona corretamente

### 2. Minutos TTS — OK para Evolution, AUSENTE para uazapi
- `evolution-webhook` gera audio TTS e registra uso via `recordTTSUsage` (com `skipUsageTracking: true` para evitar contagem dupla)
- `ai-text-to-speech` registra uso de previews do frontend (30 records, source=frontend_preview)
- **BUG CRITICO**: `uazapi-webhook` NAO gera respostas em audio — mesmo com `ai_audio_enabled = true`, so envia texto. A funcao `sendAIResponseToWhatsApp` com TTS existe APENAS no `evolution-webhook`.

### 3. Transcricao de Audio — AUSENTE para uazapi
- `evolution-webhook` transcreve audios do cliente via `transcribe-audio` edge function e injeta `[Audio transcrito]: ...` no conteudo antes de enviar pra IA
- **BUG CRITICO**: `uazapi-webhook` NAO transcreve audios — quando o cliente envia audio, o conteudo chega como `[audio]` para a IA, que nao consegue processar o conteudo real
- Transcricao nunca e registrada como usage_type (nao impacta billing, e gratis)

### 4. View `company_usage_summary` — OK
- A view agrega corretamente `usage_records` por `billing_period` atual
- Calcula `current_ai_conversations` (sum count) e `current_tts_minutes` (sum duration_seconds / 60)
- Retorna 0 rows apenas porque a query analitica nao tem contexto de auth — funciona normalmente no app

## Resumo de Problemas Encontrados

| # | Problema | Severidade | Impacto |
|---|----------|------------|---------|
| 1 | uazapi-webhook nao transcreve audios do cliente | CRITICO | IA recebe `[audio]` em vez do conteudo real — cliente nao e atendido corretamente |
| 2 | uazapi-webhook nao gera respostas em audio (TTS) | CRITICO | Mesmo com voz ativada, IA responde apenas texto no WhatsApp via uazapi |
| 3 | Previews de voz do frontend ainda sendo contabilizados | BAIXO | 30 records de `frontend_preview` em fev — infla levemente o consumo TTS |

## Correcoes Propostas

### Correcao 1: Transcricao de Audio no uazapi-webhook (CRITICO)

**Arquivo: `supabase/functions/uazapi-webhook/index.ts`**

Antes de enviar para `ai-chat`, se `messageType === "audio"`, fazer download do audio via `/message/download`, converter para base64, e chamar `transcribe-audio`. Substituir o conteudo da mensagem com a transcricao.

Logica (inserir entre a linha ~1092 onde salva a mensagem e ~1163 onde dispara AI):

```text
if (messageType === "audio" && !isFromMe) {
  // 1. Buscar media_url ja persistido no storage
  // 2. Chamar transcribe-audio com o base64
  // 3. Se transcricao OK, atualizar content da mensagem no banco
  // 4. Usar transcricao como content para AI processing
}
```

### Correcao 2: Respostas em Audio (TTS) no uazapi-webhook (CRITICO)

**Arquivo: `supabase/functions/uazapi-webhook/index.ts`**

Apos receber resposta da IA (linha ~1213), verificar se `ai_audio_enabled` esta ativo na conversa. Se sim:
1. Buscar config de voz do agente/empresa
2. Chamar `ai-text-to-speech` com `skipUsageTracking: true`
3. Enviar audio via uazapi `/send/media` (type: audio)
4. Registrar uso TTS localmente (como faz o evolution-webhook)

```text
// Verificar ai_audio_enabled na conversa
// Se ativo: gerar TTS, enviar via /send/media, registrar usage
// Se nao: enviar texto como ja faz
```

### Correcao 3: Preview TTS nao contabilizar (BAIXO)

**Arquivo: `src/components/settings/AIVoiceSettings.tsx`** (ou onde chama o preview)

Passar `skipUsageTracking: true` nas chamadas de preview de voz nas configuracoes.

## Arquivos Afetados

| Arquivo | Mudanca | Prioridade |
|---|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Adicionar transcricao de audio antes do AI processing | CRITICO |
| `supabase/functions/uazapi-webhook/index.ts` | Adicionar geracao e envio de audio TTS nas respostas da IA | CRITICO |
| Frontend (AIVoiceSettings) | Passar `skipUsageTracking: true` em previews | BAIXO |

