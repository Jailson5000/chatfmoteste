

## Correção: Voz OpenAI em português

### Contexto

As vozes da OpenAI TTS (shimmer, nova, alloy, etc.) são **multilíngues** -- falam em português automaticamente quando o texto de entrada é em português. Não existe um parâmetro "idioma" na API.

Porém, a voz `nova` tem melhor pronúncia e naturalidade em português do que `shimmer`. O código atual tem uma **inconsistência**: em um lugar usa `nova`, em outros usa `shimmer` como fallback.

### Problema identificado

No arquivo `supabase/functions/ai-text-to-speech/index.ts`:

| Cenário | Voz usada | Linha |
|---|---|---|
| Voz OpenAI selecionada explicitamente | `nova` | 375 |
| Fallback quando ElevenLabs falha | `shimmer` | 431 |
| ElevenLabs desativado | `shimmer` | 469 |

A voz `shimmer` tem pronúncia menos natural em português. A `nova` é a melhor opção da OpenAI para PT-BR.

### Solucao

1. **Padronizar todas as chamadas OpenAI para usar `nova`** no `ai-text-to-speech` (linhas 431 e 469: trocar `shimmer` por `nova`)

2. **Atualizar `voiceConfig.ts`** para refletir que a voz OpenAI disponivel é `nova` (não shimmer):
   - Trocar `openai_shimmer` por `openai_nova`
   - Atualizar nome e descrição para "Nova - Voz feminina multilíngue (PT-BR)"

3. **Atualizar `elevenlabs-tts/index.ts`** se tiver referências a shimmer no fallback

### Detalhes técnicos

```text
// voiceConfig.ts - ANTES:
{ id: "openai_shimmer", name: "Shimmer", description: "Voz feminina padrão", externalId: "shimmer" }

// voiceConfig.ts - DEPOIS:
{ id: "openai_nova", name: "Nova", description: "Voz feminina multilíngue (PT-BR)", externalId: "nova" }

// ai-text-to-speech - Linha 431 e 469:
// ANTES: generateOpenAIAudio(text, 'shimmer')
// DEPOIS: generateOpenAIAudio(text, 'nova')

// ai-text-to-speech - Linha 25 (isOpenAIVoice):
// Adicionar 'openai_nova' na verificação
```

### Arquivos modificados

| Arquivo | Alteração |
|---|---|
| `src/lib/voiceConfig.ts` | Trocar openai_shimmer por openai_nova com descrição PT-BR |
| `supabase/functions/ai-text-to-speech/index.ts` | Padronizar fallback para `nova`; atualizar `isOpenAIVoice` |
| `supabase/functions/elevenlabs-tts/index.ts` | Atualizar referências se houver |

### Impacto

- A voz OpenAI passa a usar `nova` (melhor pronúncia PT-BR) em todos os cenários
- Sem alteração em banco de dados
- Sem risco de quebrar fluxo ElevenLabs existente
- Tenants que tinham `openai_shimmer` configurado serão tratados pelo fallback (nova)

