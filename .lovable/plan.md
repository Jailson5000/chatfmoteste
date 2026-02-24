

# A IA Diz Que Nao Pode Enviar Audio (Mas Envia Audio Dizendo Isso)

## Diagnostico

O problema e uma **falha de sequenciamento e contexto**:

1. Cliente envia: "Me envie em audio, porque eu nao sei ler"
2. O webhook chama `ai-chat` para gerar a resposta
3. A IA **nao sabe que tem capacidade de audio** — nao existe nenhuma instrucao no prompt dizendo isso
4. A IA responde: "nao consigo enviar mensagens em audio"
5. **Depois** da resposta, o webhook detecta o padrao de audio e ativa o TTS
6. O TTS converte o texto "nao consigo enviar audio" em audio e envia

Resultado: a IA envia um audio dizendo que nao pode enviar audio.

### Causa raiz (2 falhas)

**Falha 1 - ai-chat ignora `audioRequested`**: O campo `context.audioRequested` existe na interface mas **nunca e usado** no codigo. A IA nao recebe nenhuma instrucao sobre sua capacidade de audio.

**Falha 2 - uazapi-webhook nao passa `audioRequested`**: O evolution-webhook calcula `shouldRespondWithAudio` **ANTES** de chamar o ai-chat e passa `audioRequested: true` no contexto. O uazapi-webhook nao faz isso — calcula o audio **DEPOIS** de receber a resposta.

## Correcoes

### Arquivo 1: `supabase/functions/uazapi-webhook/index.ts`

**Mover deteccao de audio para ANTES da chamada ai-chat** (mesmo padrao do evolution-webhook):

```typescript
// ANTES da chamada ai-chat:
const audioRequestedForThisMessage = await shouldRespondWithAudio(
  supabaseClient, conversationId, contentForAI || '', messageType
);

// Passar no contexto:
context: {
  ...
  audioRequested: audioRequestedForThisMessage,  // ADICIONAR
}
```

E depois, ao enviar a resposta, usar `audioRequestedForThisMessage` em vez de chamar `shouldRespondWithAudio` novamente.

### Arquivo 2: `supabase/functions/ai-chat/index.ts`

**Injetar instrucao de capacidade de audio no prompt quando `audioRequested` for `true`**:

Na construcao do `fullSystemPrompt` (linha ~3713), adicionar um bloco condicional:

```typescript
let audioContextInstructions = '';
if (context?.audioRequested) {
  audioContextInstructions = `

### MODO DE AUDIO ATIVO ###
Voce TEM capacidade de responder por audio. O sistema converte automaticamente sua resposta em audio de voz.
O cliente solicitou ou prefere comunicacao por audio. Responda normalmente com texto — o sistema cuidara da conversao.
IMPORTANTE: NAO diga que nao pode enviar audio. Voce PODE. Apenas escreva sua resposta e ela sera convertida em audio automaticamente.
Mantenha respostas concisas e naturais para audio (sem formatacao markdown, sem listas, sem links).
`;
}

const fullSystemPrompt = dateContextPrefix + systemPrompt + knowledgeText 
  + audioContextInstructions + toolBehaviorRules + toolExecutionRules;
```

Quando `audioRequested` for `false` ou ausente, nenhuma instrucao extra e adicionada e o comportamento permanece identico ao atual.

## Resultado Esperado

1. Cliente envia "Me envie em audio, porque eu nao sei ler"
2. `shouldRespondWithAudio` detecta o padrao → retorna `true`
3. `audioRequested: true` e passado para `ai-chat`
4. O prompt da IA recebe a instrucao "Voce TEM capacidade de responder por audio"
5. A IA responde naturalmente: "Claro! Estou aqui para ajudar. O que voce precisa?"
6. O TTS converte essa resposta em audio e envia

## Arquivos Afetados

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Mover `shouldRespondWithAudio` para antes do `ai-chat` e passar `audioRequested` no contexto |
| `supabase/functions/ai-chat/index.ts` | Usar `context.audioRequested` para injetar instrucoes de capacidade de audio no prompt |

