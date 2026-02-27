

# Diagnóstico: IA não respondeu ao áudio do João De Sale

## Causa raiz identificada

A transcrição do áudio **não foi executada** para a conversa do João De Sale. Os logs confirmam:

1. Áudio recebido e salvo no banco com `content: [audio]` e `media_url` presente ✅
2. Fila `ai_processing_queue` criada com `content: [audio]` (texto literal, sem transcrição) ❌
3. `ai-chat` chamado com `messageLength: 7` (o texto `[audio]`) — provavelmente retornou resposta vazia
4. Fila marcada como `completed` mas nenhuma mensagem de IA foi salva

**O problema**: quando a UAZAPI envia o evento `messages` com o áudio, o webhook tenta transcrever na hora. Mas existe uma condição de corrida:
- O `media_url` pode não estar disponível ainda se o upload do áudio para o storage está acontecendo em paralelo
- O webhook verificou o `persistedMediaUrl`, não encontrou (ou encontrou mas o download falhou), e seguiu em frente sem transcrição
- O `contentForAI` ficou como `[audio]` em vez de `[Áudio transcrito]: ...`

Diferente do Jailson (inst_7tdqx6d8), que recebeu o evento `FileDownloaded` da UAZAPI com a URL do arquivo **antes** do processamento, o João (inst_cgo5wn6p) pode não ter recebido esse evento a tempo.

## Correção proposta

### 1. Fallback robusto na transcrição (uazapi-webhook)

Quando a transcrição falha e o `contentForAI` ainda é `[audio]`, adicionar um retry:
- Esperar 2-3 segundos e tentar novamente buscar o `media_url` da mensagem no banco
- Se ainda não disponível, tentar download direto via URL da UAZAPI (`content.URL` do payload)
- Só enfileirar com `[audio]` literal se todas as tentativas falharem

### 2. Validação no processamento da fila

Na função `processUazapiQueuedMessages`, antes de chamar o `ai-chat`:
- Se o `combinedContent` for apenas `[audio]`, tentar transcrever novamente buscando o `media_url` da mensagem no banco (que a essa altura já deve estar disponível)

### 3. Proteção contra resposta vazia

Se o `ai-chat` retornar `response` vazio/null, o webhook já pula o envio (`if (aiText && apiUrl && apiKey)`), mas marca como `completed`. Adicionar log de warning para facilitar diagnóstico futuro.

## Arquivos a modificar

| Arquivo | Mudança |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Retry na transcrição + fallback na fila + log de warning |

## Detalhes técnicos

```text
Fluxo atual (falha):
  Áudio recebido → media_url ausente → contentForAI = "[audio]"
  → fila com "[audio]" → ai-chat recebe "[audio]" → resposta vazia → completed sem envio

Fluxo corrigido:
  Áudio recebido → media_url ausente → retry 2s → tenta content.URL direto
  → fallback na fila: re-fetch media_url do banco → transcreve
  → ai-chat recebe "[Áudio transcrito]: texto real" → resposta válida → envio
```

