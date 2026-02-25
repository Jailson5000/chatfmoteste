

# Correção: Mensagens duplicadas da IA no uazapi-webhook (falta debounce)

## Diagnóstico Confirmado nos Logs

O cliente Mario Ricardo Almeida enviou **3 documentos** simultaneamente às 14:30:40. Os logs de `ai-chat` mostram:

```
14:30:49 - Request validated (31 chars)     ← doc 1
14:30:51 - Request validated (13 chars)     ← doc 2
14:30:51 - EXECUTION START                  ← doc 2 executou
14:30:52 - EXECUTION START                  ← doc 1 executou
14:30:56 - Request validated (24 chars)     ← doc 3
14:31:09 - EXECUTION START                  ← doc 3 executou
```

Resultado: **2 respostas da IA** enviadas (14:31:14 e 14:31:20) com conteúdos diferentes.

## Causa Raiz

O `uazapi-webhook` chama `ai-chat` **diretamente** para cada mensagem recebida (linha 1490), sem nenhum mecanismo de debounce ou fila. Quando o cliente envia múltiplas mensagens em sequência (documentos, textos rápidos), cada uma dispara uma chamada independente à IA.

O `evolution-webhook` resolve isso com a `ai_processing_queue` — uma fila com debounce de 10 segundos que agrupa mensagens, usa lock atômico no banco, e só chama a IA uma vez com o conteúdo combinado.

**O `uazapi-webhook` simplesmente nunca implementou esse sistema de fila.**

## Correção

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

Substituir a chamada direta a `ai-chat` pelo mesmo sistema de fila com debounce usado no `evolution-webhook`:

1. **Adicionar função `queueMessageForAIProcessing`**: Insere/atualiza um item na tabela `ai_processing_queue` com status `pending`, agrupando mensagens que chegam dentro da janela de debounce (10s). Lida com race conditions via captura do erro 23505 (unique constraint).

2. **Adicionar função `scheduleQueueProcessing`**: Agenda o processamento da fila em background via `EdgeRuntime.waitUntil`. Re-lê o `process_after` do banco a cada tentativa (pode ter sido estendido por novas mensagens).

3. **Adicionar função `processQueuedMessages`**: Faz lock atômico (update de `pending` → `processing` com `.lte('process_after', now)`), combina as mensagens, chama `ai-chat` uma única vez, e verifica se há novos itens pendentes após a conclusão.

4. **Substituir a chamada direta** (linhas 1486-1510) por:
   ```typescript
   await queueMessageForAIProcessing(supabaseClient, {
     conversationId,
     lawFirmId,
     messageContent: contentForAI || '',
     messageType,
     contactName,
     contactPhone: phoneNumber,
     remoteJid,
     instanceId: instance.id,
     instanceName: instance.instance_name,
     clientId: resolvedClientId,
     automationId: conv.current_automation_id,
     audioRequested: audioRequestedForThisMessage,
   }, 10, requestId);
   ```

5. **A lógica de envio** (TTS, split de mensagens, jitter) se move para dentro de `processQueuedMessages`, executando apenas uma vez após o debounce.

### O que NÃO muda

- A tabela `ai_processing_queue` já existe e funciona corretamente (usada pelo evolution-webhook)
- Os índices únicos de proteção contra duplicidade já estão criados
- A função `ai-chat` continua sendo chamada da mesma forma, apenas de um único ponto após o debounce

## Resultado Esperado

| Cenário | Antes | Depois |
|---|---|---|
| Cliente envia 3 docs simultâneos | 3 chamadas à IA → 2-3 respostas | 1 chamada com conteúdo combinado → 1 resposta |
| Cliente envia texto + texto rápido | 2 chamadas à IA → respostas separadas | Agrupado em 1 chamada → 1 resposta coerente |
| Cliente envia 1 mensagem isolada | 1 chamada à IA (imediata) | 1 chamada à IA (após 10s debounce) |

O debounce de 10s é o mesmo valor usado no evolution-webhook e representa o tempo que o sistema espera por mensagens adicionais antes de processar o lote.

