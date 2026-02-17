
# Correcao: TTS Contabilizado em Dobro (Custo Inflado)

## Problema Identificado

Analisei os dados de uso de fevereiro e encontrei o seguinte:

### 1. TTS sendo contabilizado DUAS VEZES por audio

Cada audio gerado pelo agente de IA cria **2 registros** de uso na tabela `usage_records`:

```text
19:21:09 -> source: "frontend_preview" (registrado por ai-text-to-speech)
19:21:13 -> voice_source: "agente"       (registrado por evolution-webhook)
```

Isso acontece porque:
- O `evolution-webhook` chama a funcao `ai-text-to-speech` para gerar o audio
- A funcao `ai-text-to-speech` registra o uso internamente como `frontend_preview`
- O `evolution-webhook` TAMBEM registra o uso como `agente`

**Resultado**: 22 audios reais geraram 44 registros de uso -- **cobranca em dobro!**

### 2. Volume de IA realmente aumentou hoje (nao e duplicacao)

| Dia | Mensagens IA | Mensagens Cliente |
|-----|-------------|-------------------|
| Feb 16 | 138 | 360 |
| Feb 17 | 401 | 444 |

O aumento de ~3x nas respostas da IA e real (mais conversas ativas hoje). Os 2.625 requests na OpenAI no mes estao alinhados com os 2.811 mensagens de IA geradas -- nao ha duplicacao nas chamadas de IA em si.

## Correcao

### Arquivo: `supabase/functions/ai-text-to-speech/index.ts`

Remover o registro de uso de TTS quando a funcao e chamada pelo backend (service_role_key). A funcao `ai-text-to-speech` deve registrar uso **somente quando chamada diretamente pelo frontend** (preview de voz). Quando chamada pelo `evolution-webhook`, quem registra e o proprio webhook com metadados mais completos (conversation_id, voice_id, voice_source).

**Logica**: Detectar se a chamada vem do service_role (backend) verificando o header Authorization. Se vier com service_role_key, pular o registro de uso (o webhook ja faz isso). Se vier do frontend (anon key), registrar normalmente.

Alternativa mais simples: adicionar um parametro `skipUsageTracking: true` no body da requisicao quando chamada pelo `evolution-webhook`, e verificar esse flag antes de registrar.

**Mudanca no `ai-text-to-speech/index.ts`** (linhas 104-139):
- Adicionar verificacao do parametro `skipUsageTracking` no body
- Se `skipUsageTracking === true`, nao chamar `recordTTSUsage`

**Mudanca no `evolution-webhook/index.ts`** (linhas 1986-1997):
- Adicionar `skipUsageTracking: true` no body da chamada ao `ai-text-to-speech`

## Resumo

| Mudanca | Arquivo | Impacto |
|---------|---------|---------|
| Adicionar flag `skipUsageTracking` | ai-text-to-speech | Evita registro duplo de TTS |
| Enviar flag na chamada TTS | evolution-webhook | Zero risco -- apenas adiciona campo |

## Resultado Esperado

- Cada audio gerado pelo agente registra uso apenas 1 vez (pelo evolution-webhook com metadados completos)
- Previews de voz no frontend continuam registrando uso normalmente
- Custo de TTS reduzido pela metade imediatamente
