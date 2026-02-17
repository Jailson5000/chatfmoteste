

# Correção: PDFs Não Aparecendo + Download Base64 Bloqueando Processamento

## Diagnóstico

Analisei o banco de dados e os logs detalhadamente:

1. **PDFs diretos ESTÃO sendo salvos** no banco de dados (confirmei 10+ PDFs recentes com `message_type: document`)
2. **O download do base64 do PDF para IA está BLOQUEANDO** o processamento da mensagem por até 10 segundos (timeout do fetch). Isso pode causar timeout do edge function quando vários clientes enviam mensagens simultaneamente
3. **O base64 do PDF NUNCA chega na IA** -- todos os 10 itens recentes na fila de processamento têm `document_file_name: NULL`, indicando que o download falha ou o base64 muito grande causa erro ao salvar no JSONB
4. **Mensagens de imagem sem legenda** causam erro na IA (`"conversationId and message are required"`) porque o campo `message` fica vazio

## Correções

### 1. Mover download do PDF base64 PARA DEPOIS de salvar a mensagem

**Arquivo**: `supabase/functions/evolution-webhook/index.ts`

**Problema**: O download do base64 (linhas 4994-5074) acontece DENTRO do bloco de deteccao de tipo, ANTES de salvar a mensagem no banco. Se o download travar por 10s ou falhar, atrasa ou impede o salvamento.

**Solucao**: Remover o download do base64 do bloco de deteccao de tipo. Em vez disso, fazer o download DEPOIS que a mensagem ja foi salva, logo antes de enfileirar para processamento da IA. Assim:
- A mensagem é SEMPRE salva primeiro (zero risco de perda)
- O download do base64 só acontece se o handler é IA (sem desperdício)
- Se o download falhar, a IA recebe apenas o nome do arquivo (fallback seguro)

### 2. Não armazenar base64 na fila -- baixar sob demanda

**Arquivo**: `supabase/functions/evolution-webhook/index.ts`

**Problema**: Armazenar 5MB de base64 no campo JSONB `metadata` da tabela `ai_processing_queue` pode falhar silenciosamente ou causar lentidao na query.

**Solucao**: Em vez de armazenar o base64 na fila, armazenar apenas os metadados (`document_file_name`, `document_mime_type`, `whatsapp_message_id`). Quando a fila for processada, baixar o base64 naquele momento. Isso:
- Elimina o problema de tamanho no JSONB
- O download acontece no momento certo (quando a IA vai processar)
- Se o download falhar, a IA processa normalmente sem o conteudo do PDF

### 3. Permitir mensagem vazia no ai-chat quando tem documento

**Arquivo**: `supabase/functions/ai-chat/index.ts`

**Problema**: Linha 2666 rejeita mensagens quando `!message` é true. Imagens sem legenda (e futuramente, documentos sem nome) enviam `message: ""`.

**Solucao**: Alterar a validacao para aceitar mensagem vazia quando `context.documentBase64` está presente, ou quando o `message` é uma string vazia (não null/undefined):
```text
if (!conversationId || (message === undefined || message === null)) {
```

### 4. Baixar PDF base64 no processador da fila (debounce)

**Arquivo**: `supabase/functions/evolution-webhook/index.ts`

Na funcao que processa a fila (`processQueueItem` ou equivalente), quando encontrar metadados de documento PDF:
1. Verificar se `document_mime_type === 'application/pdf'`
2. Usar o `whatsapp_message_id` para baixar o base64 via Evolution API
3. Passar o base64 para o `ai-chat` no contexto

Isso garante que o download acontece no momento do processamento, não durante o recebimento da mensagem.

## Resumo das Mudanças

| Mudança | Arquivo | Impacto |
|---------|---------|---------|
| Remover download PDF do bloco de deteccao | evolution-webhook | Elimina bloqueio de 10s no processamento |
| Não armazenar base64 no JSONB da fila | evolution-webhook | Resolve falha silenciosa de insert |
| Baixar PDF no processador da fila | evolution-webhook | PDF chega na IA sob demanda |
| Aceitar message vazia no ai-chat | ai-chat | Corrige erro 400 para imagens |

## Resultado Esperado

- Mensagens de documento são SEMPRE salvas imediatamente (zero risco de perda)
- A IA recebe o conteudo do PDF quando disponivel (download sob demanda)
- Se o download falhar, a IA responde normalmente usando apenas o nome do arquivo
- Imagens sem legenda não causam mais erro 400 na IA

