

# Correcao: Mensagens perdidas quando duas chegam simultaneamente para contato novo

## Problema Identificado

Analisei os logs do webhook e confirmei que **ambas as mensagens foram recebidas** pelo sistema:
- "Bom dia" (ID: `AC75B1890F13F3CBE08EE992EB18D653`) chegou as `09:55:39.159`
- "Oi" (ID: `ACBD6693E68C836B390718D268C79E06`) chegou as `09:55:40.561`

Porem, apenas "Oi" foi salva no banco de dados.

## Causa Raiz: Race Condition na criacao de conversa

Quando duas mensagens chegam quase simultaneamente para um **contato novo** (sem conversa existente):

```text
Webhook 1 ("Bom dia")          Webhook 2 ("Oi")
    |                               |
    v                               v
Busca conversa -> NAO EXISTE   Busca conversa -> NAO EXISTE
    |                               |
    v                               v
INSERT conversa -> SUCESSO     INSERT conversa -> ERRO 23505 (unique constraint)
    |                               |
    v                               v
Salva mensagem -> OK           break; -> MENSAGEM PERDIDA!
```

A tabela `conversations` tem um indice unico: `idx_conversations_unique_active_remote_jid(remote_jid, whatsapp_instance_id, law_firm_id)`.

Quando o Webhook 2 tenta criar a conversa e recebe erro de constraint unica (codigo `23505`), o codigo atual faz `break` (linha 4553), **abandonando o processamento sem salvar a mensagem**.

## Correcao

### Arquivo: `supabase/functions/evolution-webhook/index.ts`

**Mudanca nas linhas 4551-4554**: Em vez de `break` quando a criacao falhar com unique constraint, re-buscar a conversa existente e continuar o processamento normalmente.

Codigo atual:
```text
if (createError) {
    logDebug('ERROR', `Failed to create conversation`, { requestId, error: createError });
    break;
}
```

Codigo corrigido:
```text
if (createError) {
    if (createError.code === '23505') {
        // Unique constraint - another webhook already created this conversation
        // Re-fetch the existing conversation and continue processing
        logDebug('DB', `Conversation already created by concurrent webhook, re-fetching`, { 
            requestId, error: createError.code 
        });
        
        const { data: existingConv } = await supabaseClient
            .from('conversations')
            .select('*')
            .eq('remote_jid', remoteJid)
            .eq('law_firm_id', lawFirmId)
            .eq('whatsapp_instance_id', instance.id)
            .is('archived_at', null)
            .maybeSingle();
        
        if (existingConv) {
            conversation = existingConv;
            logDebug('DB', `Re-fetched conversation after concurrent creation`, { 
                requestId, conversationId: conversation.id 
            });
        } else {
            logDebug('ERROR', `Could not re-fetch conversation after 23505`, { requestId });
            break;
        }
    } else {
        logDebug('ERROR', `Failed to create conversation`, { requestId, error: createError });
        break;
    }
}
```

## Resumo

| Mudanca | Risco | Impacto |
|---------|-------|---------|
| Tratar erro 23505 na criacao de conversa com re-fetch | Zero - apenas adiciona fallback | Elimina perda de mensagens em contatos novos |

## Resultado Esperado

- Quando duas mensagens chegam simultaneamente para um contato novo, ambas serao salvas corretamente
- O primeiro webhook cria a conversa, o segundo detecta o conflito, re-busca a conversa existente e salva a mensagem normalmente
- Nenhuma mensagem sera perdida

