

# Correção: Risco de Mensagem Sem Resposta (e Duplicata Residual)

## Problema Encontrado

O índice único criado bloqueia a combinacao "1 pending + 1 processing" para a mesma conversa, mas o fluxo correto PRECISA permitir isso:

```text
Timeline do problema:
1. Item A: pending -> processing (OK)
2. Mensagem nova chega -> tenta criar Item B: pending 
3. UNIQUE INDEX bloqueia! (pending + processing = 2 ativos)
4. Fallback: processa direto -> RESPOSTA DUPLICADA
   OU: mensagem perdida sem resposta
```

## Correção

### 1. Migração SQL: Trocar o indice

Remover o indice que bloqueia `pending + processing` juntos e criar **dois indices separados**:

```sql
-- Remover indice restritivo demais
DROP INDEX IF EXISTS idx_ai_queue_active_conversation;

-- Manter apenas: no maximo 1 pending por conversa
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_queue_pending_conversation 
  ON public.ai_processing_queue(conversation_id) 
  WHERE status = 'pending';

-- Novo: no maximo 1 processing por conversa
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_queue_processing_conversation 
  ON public.ai_processing_queue(conversation_id) 
  WHERE status = 'processing';
```

Isso permite ter 1 pending E 1 processing simultaneamente, mas nunca 2 pendings ou 2 processings.

### 2. Simplificar o tratamento de erro no evolution-webhook

No bloco `insertError` (linhas 1217-1228), remover a recursao e tratar de forma mais segura:

```text
if (insertError) {
  if (insertError.code === '23505') {
    // Ja existe um pending -- buscar e adicionar mensagem a ele
    const { data: existingPending } = await supabaseClient
      .from('ai_processing_queue')
      .select('id, messages, message_count')
      .eq('conversation_id', context.conversationId)
      .eq('status', 'pending')
      .maybeSingle();
    
    if (existingPending) {
      // Append message to existing pending item
      const updatedMessages = [...(existingPending.messages || []), messageData];
      await supabaseClient
        .from('ai_processing_queue')
        .update({
          messages: updatedMessages,
          message_count: updatedMessages.length,
          process_after: effectiveProcessAfter, // reset debounce
        })
        .eq('id', existingPending.id);
    }
    // Se nao encontrou pending, significa que tem processing -- a mensagem
    // sera coberta pelo proximo processamento (ver nextPending check)
  } else {
    // Erro desconhecido -- fallback para processamento direto
    await processAutomations(supabaseClient, context as AutomationContext);
  }
}
```

### 3. Garantir que mensagens durante processing nao se percam

Ajustar a logica: quando ha um `processingItem` ativo, o INSERT de um novo `pending` DEVE funcionar (com os 2 indices separados). Se ainda assim falhar, fazer append ao pending existente em vez de recursao.

Tambem adicionar o `process_after` com verificacao mais robusta no `nextPending` check (linhas 1465-1471):

```text
// Apos completar o processing, esperar 2s e verificar pending
// (para dar tempo de mensagens em transito serem enfileiradas)
const { data: nextPending } = await supabaseClient
  .from('ai_processing_queue')
  .select('id')
  .eq('conversation_id', conversationId)
  .eq('status', 'pending')
  .maybeSingle(); // Remover filtro de process_after para pegar QUALQUER pending

if (nextPending) {
  // Aguardar o debounce restante antes de processar
  const { data: nextDetails } = await supabaseClient
    .from('ai_processing_queue')
    .select('process_after')
    .eq('id', nextPending.id)
    .single();
  
  const waitMs = Math.max(0, 
    new Date(nextDetails.process_after).getTime() - Date.now()
  );
  
  if (waitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  
  await processQueuedMessages(supabaseClient, conversationId, requestId);
}
```

## Fluxo Corrigido

```text
1. Mensagem 1 chega -> Cria pending (idx_pending OK)
2. Mensagem 2 chega -> Append ao pending (idx_pending bloqueia duplicata)
3. Debounce expira -> pending vira processing (idx_processing OK, idx_pending liberado)
4. Mensagem 3 chega -> Cria novo pending (idx_pending OK, idx_processing ja existe = permitido)
5. Processing completa -> Verifica pending -> Processa sequencialmente
6. Resultado: 1 resposta para msgs 1+2, 1 resposta para msg 3 (correto!)
```

## Resumo das Mudancas

| Arquivo | Mudanca | Risco |
|---------|---------|-------|
| Migracao SQL | Trocar 1 indice por 2 separados | Zero -- mais permissivo |
| evolution-webhook | Remover recursao, usar append | Baixo -- simplifica logica |
| evolution-webhook | Melhorar nextPending check | Zero -- espera debounce |

## Resultado Esperado

- Nenhuma mensagem fica sem resposta
- Nenhuma resposta duplicada
- Mensagens que chegam durante processing sao agrupadas no proximo batch
- Processamento sequencial garantido pelos indices + check pos-completion
