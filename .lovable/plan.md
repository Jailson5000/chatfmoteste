
# Correção: IA respondendo múltiplas vezes (respostas duplicadas)

## Causa Raiz

O sistema de debounce usa a tabela `ai_processing_queue` com um índice único **apenas** para `status = 'pending'`:

```text
CREATE UNIQUE INDEX idx_ai_queue_pending_conversation 
  ON ai_processing_queue(conversation_id) 
  WHERE status = 'pending';
```

**O que acontece:**

1. Cliente envia mensagem 1 e 2 rapidamente -- agrupadas na Queue #1 (status: `pending`)
2. Debounce expira -- Queue #1 muda para `processing`
3. Cliente envia mensagem 3 enquanto Queue #1 ainda está processando
4. Como não existe item `pending`, o sistema **cria Queue #2** (o unique index permite)
5. Queue #1 e Queue #2 geram respostas independentes -- resultando em respostas duplicadas
6. Ambas as respostas vão para o WhatsApp

## Correção

### Arquivo: `supabase/functions/evolution-webhook/index.ts`

Na função `queueMessageForAIProcessing` (linha ~1127), **antes** de criar um novo item na fila, verificar se já existe um item com `status = 'processing'` para a mesma conversa. Se existir, aguardar que ele termine antes de iniciar novo processamento.

**Mudança 1**: Após a busca por itens `pending` (linha 1128-1133), adicionar verificação de itens `processing`:

```text
// Se não existe pending, verificar se existe processing
if (!existingQueue) {
  const { data: processingItem } = await supabaseClient
    .from('ai_processing_queue')
    .select('id')
    .eq('conversation_id', context.conversationId)
    .eq('status', 'processing')
    .maybeSingle();

  if (processingItem) {
    // Já tem item sendo processado. Criar como pending e o scheduler
    // vai processar depois que o atual terminar.
    // (o insert vai funcionar pois o unique index é só para pending)
    // MAS precisamos garantir que o novo item só será processado
    // APÓS o processing atual terminar.
    // Solução: aumentar o debounce para dar tempo do processing atual terminar
    const extendedDebounce = Math.max(debounceSeconds, 15); // mínimo 15s
    const extendedProcessAfter = new Date(Date.now() + extendedDebounce * 1000).toISOString();
    // ... criar novo item com processAfter estendido
  }
}
```

**Mudança 2**: Na função `processQueuedMessages` (linha ~1329), após completar o processamento, verificar se há um novo item `pending` que chegou durante o processamento e processá-lo em sequência:

```text
// Após marcar como completed (linha 1409):
// Verificar se há novo item pending que chegou durante processing
const { data: nextPending } = await supabaseClient
  .from('ai_processing_queue')
  .select('id')
  .eq('conversation_id', conversationId)
  .eq('status', 'pending')
  .lte('process_after', new Date().toISOString())
  .maybeSingle();

if (nextPending) {
  // Processar o próximo item em sequência (não em paralelo)
  await processQueuedMessages(supabaseClient, conversationId, requestId);
}
```

**Mudança 3**: Adicionar cleanup de itens `processing` travados (safety net). Se um item ficou em `processing` por mais de 2 minutos, marcá-lo como `failed` para desbloquear a fila:

```text
// No início de processQueuedMessages:
// Cleanup de itens travados
await supabaseClient
  .from('ai_processing_queue')
  .update({ status: 'failed', error_message: 'Timeout: stuck in processing' })
  .eq('conversation_id', conversationId)
  .eq('status', 'processing')
  .lt('processing_started_at', new Date(Date.now() - 120000).toISOString());
```

### Migração SQL (Opcional mas recomendada)

Adicionar um segundo índice único que impede ter um item `processing` e `pending` simultaneamente:

```sql
-- Impedir mais de 1 item "ativo" (pending ou processing) por conversa
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_queue_active_conversation 
  ON public.ai_processing_queue(conversation_id) 
  WHERE status IN ('pending', 'processing');
```

Isso garante que, **no nível do banco de dados**, nunca existam dois itens ativos para a mesma conversa.

## Resumo das Mudanças

| Mudança | Arquivo | Risco |
|---------|---------|-------|
| Verificar `processing` antes de criar novo item | evolution-webhook | Zero -- apenas adiciona check |
| Processar próximo item após completar | evolution-webhook | Baixo -- recursão controlada |
| Cleanup de itens travados | evolution-webhook | Zero -- safety net |
| Índice único `pending+processing` | Migração SQL | Zero -- proteção no banco |

## Resultado Esperado

- Cada conversa terá no máximo **1 resposta da IA** por "rajada" de mensagens
- Mensagens que chegam durante processamento serão enfileiradas e processadas após a resposta atual
- Itens travados são automaticamente liberados após 2 minutos
