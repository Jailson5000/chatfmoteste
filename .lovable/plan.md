

# Audios da IA Nao Chegam - Diagnostico e Correcao

## Problemas Identificados

A analise dos logs, banco de dados e codigo revelou **dois problemas distintos** causando falhas no fluxo de audio da IA:

### Problema 1: IA diz "nao consigo enviar audio" DENTRO do proprio audio

**Evidencia**: Mensagem `91f2a14e` (18:01) tem `message_type: audio` com `media_url` valida, mas o conteudo diz *"infelizmente nao consigo enviar mensagens em audio"*. O sistema gerou TTS desse texto e enviou ao WhatsApp um audio da IA dizendo que nao pode enviar audio.

**Causa**: A instrucao de audio injetada no prompt (`### MODO DE AUDIO ATIVO ###`) fica no FINAL do prompt de sistema, apos a base de conhecimento e regras de ferramentas. Modelos de IA frequentemente priorizam instrucoes do inicio do prompt e ignoram instrucoes do final, especialmente quando o prompt e longo.

**Correcao**: Mover a instrucao de audio para ANTES do prompt de sistema (logo apos o prefixo de data), garantindo maxima prioridade. Tambem reforcar a linguagem para ser mais assertiva.

### Problema 2: "Audio nao disponivel" no painel MiauChat

**Evidencia**: Mensagem `b8c7fb91` (20:17) tem `message_type: audio` mas `media_url: null`. O audio FOI enviado ao WhatsApp (aparece no celular), mas o armazenamento falhou silenciosamente.

**Causa**: O `whatsapp_message_id` salvo e `885da55e-fa72-4177-9058-bd79baa29c14` (formato UUID) - gerado por `crypto.randomUUID()` como fallback. Isso indica que a resposta do uazapi `/send/audio` nao retornou um `key.id` no formato esperado. O upload ao storage usa esse ID no path, mas se o upload falhar por qualquer motivo (permissao, `atob` em dados grandes), o erro e ignorado silenciosamente e `media_url` fica `null`.

**Correcao**: 
1. Usar `upsert: true` no upload ao storage (evitar erro se arquivo ja existir)
2. Adicionar log detalhado quando o storage falhar
3. Se o storage falhar, gerar URL publica como fallback (getPublicUrl)
4. Usar decodificacao base64 chunked (segura para dados grandes) em vez de `atob` direto

## Mudancas Tecnicas

### Arquivo 1: `supabase/functions/ai-chat/index.ts`

**Mover instrucao de audio para o INICIO do prompt de sistema** (antes de `systemPrompt`):

```typescript
// ANTES (audio no final, ignorado pelo modelo):
const fullSystemPrompt = dateContextPrefix + systemPrompt + knowledgeText + audioContextInstructions + ...;

// DEPOIS (audio no inicio, maxima prioridade):
const fullSystemPrompt = dateContextPrefix + audioContextInstructions + systemPrompt + knowledgeText + ...;
```

**Reforcar texto da instrucao** para ser mais enfatico:

```
### REGRA ABSOLUTA - MODO DE AUDIO ATIVO ###
PROIBIDO dizer que voce nao pode enviar audio. Voce PODE e VAI.
Sua resposta sera automaticamente convertida em audio de voz.
Responda com texto normal e conciso. O sistema cuida da conversao.
NAO use markdown, listas longas, links ou emojis.
Fale como se estivesse ao telefone.
```

### Arquivo 2: `supabase/functions/uazapi-webhook/index.ts`

1. **Base64 decoding seguro** (chunked, evita stack overflow):
```typescript
// Substituir atob por decodificacao chunked
const raw = ttsData.audioContent;
const binLen = raw.length * 3 / 4 - (raw.endsWith('==') ? 2 : raw.endsWith('=') ? 1 : 0);
const audioBytes = new Uint8Array(binLen);
// ... usar decode chunked do Deno std
```

Na verdade, Deno tem `decode` do `std/encoding/base64.ts`:
```typescript
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
const audioBytes = base64Decode(ttsData.audioContent);
```

2. **Usar `upsert: true`** no upload ao storage (linha 1659)

3. **Fallback para URL publica** se signed URL falhar

4. **Log detalhado** no catch do storage

### Arquivo 3: `supabase/functions/evolution-webhook/index.ts`

Mesmas correcoes de storage:

1. **Substituir `atob` + loop manual** (linhas 3176-3180) por `base64Decode` do Deno std
2. **Usar `upsert: true`** (linha 3192)
3. **Fallback para URL publica**

## Resumo das Mudancas

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/ai-chat/index.ts` | Mover instrucao de audio para INICIO do prompt; reforcar linguagem |
| `supabase/functions/uazapi-webhook/index.ts` | Base64 decode seguro; upsert: true; fallback URL publica; log detalhado |
| `supabase/functions/evolution-webhook/index.ts` | Base64 decode seguro; upsert: true; fallback URL publica |

## Resultado Esperado

1. IA nunca mais dira "nao consigo enviar audio" quando modo de audio estiver ativo
2. Audios gerados sempre terao `media_url` no banco (storage com fallback)
3. Painel MiauChat exibira o player de audio corretamente em vez de "Audio nao disponivel"
4. Audio continua chegando normalmente no WhatsApp do cliente

