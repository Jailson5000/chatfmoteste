

## Correção: Voz da IA em inglês

### Causa raiz

O ElevenLabs **atualizou os nomes dos formatos de áudio**. O código usa `ogg_opus` que agora é inválido — o formato correto é `opus_48000_128`.

O fluxo atual:
1. Tenta ElevenLabs com formato `ogg_opus` -> **403 Forbidden** (formato inválido)
2. O código trata 403 como erro fatal (só tenta o próximo formato em caso de 400/422)
3. **Pula o formato MP3** e cai direto no fallback OpenAI
4. OpenAI TTS usa voz `shimmer` (inglesa) -> **áudio em inglês**

### Solução

**Arquivo: `supabase/functions/ai-text-to-speech/index.ts`**

1. **Corrigir formatos do ElevenLabs**: Atualizar `ogg_opus` para `opus_48000_128` (formato válido atual)
2. **Tratar 403 como erro de formato**: Adicionar 403 na lista de status que tentam o próximo formato, garantindo que o MP3 seja tentado antes de pular para OpenAI
3. **Corrigir formatos no `elevenlabs-tts/index.ts`**: Mesmo problema existe na outra edge function de TTS (usada pelo frontend)

### Detalhes técnicos

```text
// ANTES (quebrado):
{ format: 'ogg_opus', mimeType: 'audio/ogg; codecs=opus' }
// Status 403 -> pula direto para OpenAI (shimmer/inglês)

// DEPOIS (correto):
{ format: 'opus_48000_128', mimeType: 'audio/ogg; codecs=opus' }
// + tratar 403 como retry para próximo formato
```

Arquivos modificados:

| Arquivo | Alteração |
|---|---|
| `supabase/functions/ai-text-to-speech/index.ts` | Corrigir formato `ogg_opus` para `opus_48000_128`; tratar 403 como tentativa de próximo formato |
| `supabase/functions/elevenlabs-tts/index.ts` | Mesmo fix no formato (consistência) |

### Impacto

- ElevenLabs volta a funcionar com voz Felipe (português)
- Sem alteração em banco de dados ou RLS
- Fallback para OpenAI continua existindo, mas só será usado se ElevenLabs realmente falhar em todos os formatos
- Sem risco de quebrar outros fluxos
