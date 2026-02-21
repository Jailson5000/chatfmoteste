

## Remover Contagem de Consumo do Preview de Voz

### Problema
Quando o cliente testa vozes na aba "Voz de IA" (configuracoes), cada teste conta como consumo de TTS no faturamento. Isso nao deveria acontecer -- apenas audios enviados pela IA no chat devem ser contabilizados.

### Causa
A Edge Function `elevenlabs-tts` (usada exclusivamente para preview/teste de voz) registra cada teste na tabela `usage_records` com `source: 'frontend_preview'`.

### Solucao
Remover a chamada `recordTTSUsage()` da funcao `elevenlabs-tts`. A funcao de producao `ai-text-to-speech` (que envia audio real no chat) ja faz o tracking corretamente.

### Arquivo modificado

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/elevenlabs-tts/index.ts` | Remover a chamada `recordTTSUsage()` (linhas 293-298) e a funcao `recordTTSUsage` inteira (linhas 66-100), alem dos helpers `getCurrentBillingPeriod` e `estimateAudioDuration` que so eram usados por ela |

### Impacto

- Testes de voz nas configuracoes deixam de contar no consumo
- Consumo real (audio enviado no chat) continua sendo contado normalmente pela funcao `ai-text-to-speech`
- Nenhuma outra parte do sistema e afetada
- Complexidade: muito baixa (apenas remocao de codigo)

