

# Implementar Audio Mode State Machine no uazapi-webhook

## Problema

O uazapi-webhook tem o codigo de TTS (gerar e enviar audio) mas **nao tem a logica de detectar quando o cliente pede audio**. O campo `ai_audio_enabled` fica sempre `false` porque ninguem o ativa.

Na imagem, o cliente diz "Me envie em audio, porque eu nao sei ler" e a IA responde com texto dizendo "nao consigo enviar mensagens em audio" — porque:
1. `ai_audio_enabled = false` na conversa (confirmado no banco)
2. O uazapi-webhook nao tem as funcoes `isAudioRequestedFromText`, `isAudioDeactivationRequest` e `shouldRespondWithAudio` que existem no evolution-webhook
3. O uazapi-webhook tambem nao processa os comandos `@Ativar audio` / `@Desativar audio` que a IA pode incluir na resposta

## Correcoes

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

**Adicao 1: Funcoes de deteccao de audio (copiar do evolution-webhook)**

Adicionar antes do bloco de AI processing (~linha 1259):

- `isAudioRequestedFromText(text)` — detecta frases como "manda audio", "responde por audio", "nao sei ler", "nao consigo ler"
- `isAudioDeactivationRequest(text)` — detecta frases como "prefiro texto", "sem audio", "volta pro texto"
- `updateAudioModeState(client, conversationId, enabled, reason)` — persiste a mudanca no banco
- `shouldRespondWithAudio(client, conversationId, messageText, messageType)` — state machine completa:
  - Cliente pede audio → ativa
  - Cliente manda texto (quando audio esta ativo) → desativa
  - Cliente manda audio (quando audio esta ativo) → mantem

**Adicao 2: Chamar `shouldRespondWithAudio` antes de responder**

Substituir a logica atual (linha 1320):
```
const audioEnabled = conv?.ai_audio_enabled === true;
```

Por:
```
const audioEnabled = await shouldRespondWithAudio(
  supabaseClient, conversationId, contentForAI || '', messageType
);
```

**Adicao 3: Processar comandos `@Ativar audio` / `@Desativar audio` na resposta da IA**

Apos receber `aiText` da IA (linha 1312), processar comandos de audio:
- Detectar `@Ativar áudio` → ativar `ai_audio_enabled = true` + remover do texto
- Detectar `@Desativar áudio` → desativar `ai_audio_enabled = false` + remover do texto

Isso permite que a IA autonomamente ative o modo audio quando detecta que o cliente precisa (ex: "nao sei ler").

## Resultado Esperado

Quando o cliente enviar "Me envie em audio, porque eu nao sei ler":
1. `isAudioRequestedFromText` detecta o padrao "nao sei ler" → pattern de acessibilidade
2. `shouldRespondWithAudio` retorna `true` e persiste `ai_audio_enabled = true`
3. O TTS gera o audio e envia via `/send/audio` como PTT
4. Proximas mensagens de audio do cliente continuam recebendo audio
5. Se o cliente mandar texto, auto-desativa o modo audio

## Arquivos Afetados

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Adicionar state machine de audio mode (4 funcoes + integracao no fluxo) |

