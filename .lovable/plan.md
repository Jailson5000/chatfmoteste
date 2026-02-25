

# Análise: Jitter de Resposta da IA

## Status Atual

| Webhook | Jitter Implementado | Delay Antes da 1a Msg | Delay Entre Partes |
|---|---|---|---|
| `evolution-webhook` | Sim | 1-3s + delay configurado por agente | 3-7s (`messageSplitDelay`) |
| `uazapi-webhook` | **Não** | **0s (instantâneo)** | 1-3s (inline básico) |

## O Que Funciona (evolution-webhook)

O `evolution-webhook` importa e usa corretamente o `human-delay.ts`:
- Primeira mensagem: `humanDelay(AI_RESPONSE.min + clientDelayMs, AI_RESPONSE.max + clientDelayMs)` = **1-3s base + delay configurado no agente**
- Partes subsequentes: `messageSplitDelay()` = **3-7s**
- Áudio TTS: delay antes do primeiro chunk, 0.5-1s entre chunks
- Mídia: delay antes de enviar imagem/vídeo

## O Que Não Funciona (uazapi-webhook)

O `uazapi-webhook` (linhas 1808-1830):
- **Não importa** `human-delay.ts`
- Primeira mensagem enviada **instantaneamente** após receber resposta da IA
- Entre partes: `1000 + Math.random() * 2000` (1-3s hardcoded, sem usar DELAY_CONFIG)
- Áudio TTS: **nenhum delay**

## Correção Proposta

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

1. **Importar** `humanDelay`, `messageSplitDelay`, `DELAY_CONFIG` do `_shared/human-delay.ts`

2. **Antes da primeira mensagem de texto** (linha ~1810): Adicionar `humanDelay(DELAY_CONFIG.AI_RESPONSE.min + clientDelayMs, DELAY_CONFIG.AI_RESPONSE.max + clientDelayMs, '[UAZAPI_AI]')` — onde `clientDelayMs` vem do `response_delay_seconds` configurado no agente (já disponível na variável `conv`)

3. **Entre partes de mensagem** (linha ~1812): Substituir o delay hardcoded por `messageSplitDelay(i, parts.length, '[UAZAPI_AI]')`

4. **Antes do primeiro chunk de áudio TTS** (na seção de áudio ~linha 1550): Adicionar `humanDelay(DELAY_CONFIG.AI_RESPONSE.min + clientDelayMs, DELAY_CONFIG.AI_RESPONSE.max + clientDelayMs, '[UAZAPI_TTS]')`

5. **Entre chunks de áudio** (dentro do loop de TTS): Adicionar `humanDelay(DELAY_CONFIG.AUDIO_CHUNK.min, DELAY_CONFIG.AUDIO_CHUNK.max, '[UAZAPI_TTS_CHUNK]')`

### Obter `response_delay_seconds` do Agente

Preciso verificar se o uazapi-webhook já lê o `response_delay_seconds` da automação. Se não, buscar esse valor para usar como `clientDelayMs` adicional.

## Resultado Esperado

Após a correção, ambos os webhooks terão comportamento idêntico:
- 1-3s de jitter base + delay configurado no agente antes da primeira mensagem
- 3-7s entre partes de mensagem split
- Delays adequados para chunks de áudio TTS

