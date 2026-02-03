

# Plano: Correção Urgente - Mensagens Não Estão Sendo Salvas

## Problema Crítico Identificado

### Evidência do Erro
```
[ERROR] Failed to save message | error: "there is no unique or exclusion constraint matching the ON CONFLICT specification" | code: 42P10
```

**Impacto**: TODAS as mensagens recebidas no WhatsApp estão falhando ao salvar no banco de dados desde a última atualização.

### Causa Raiz

A mudança implementada anteriormente tentou usar `upsert` com `onConflict: 'law_firm_id,whatsapp_message_id'`:

```typescript
// Código problemático (atual)
.upsert({...}, {
  onConflict: 'law_firm_id,whatsapp_message_id',  // ← ERRO
  ignoreDuplicates: true
})
```

O problema é que o índice criado é **parcial**:
```sql
CREATE UNIQUE INDEX messages_whatsapp_message_id_per_tenant 
ON public.messages (law_firm_id, whatsapp_message_id) 
WHERE (whatsapp_message_id IS NOT NULL)  -- ← Este WHERE impede o uso com upsert
```

O PostgreSQL/PostgREST **não aceita** índices parciais para `ON CONFLICT` - ele precisa de um índice único completo.

---

## Solução

### Abordagem Escolhida: Voltar para INSERT com verificação prévia

O código já possui verificação de duplicatas ANTES do insert (linhas 4742-4752), então podemos simplesmente substituir o `upsert` por `insert`:

```typescript
// ANTES (problemático)
const insertResult = await supabaseClient
  .from('messages')
  .upsert({...}, {
    onConflict: 'law_firm_id,whatsapp_message_id',
    ignoreDuplicates: true
  })
  .select()
  .maybeSingle();

// DEPOIS (corrigido)
const insertResult = await supabaseClient
  .from('messages')
  .insert({
    conversation_id: conversation.id,
    law_firm_id: conversation.law_firm_id,
    whatsapp_message_id: data.key.id,
    content: messageContent,
    message_type: messageType,
    media_url: mediaUrl || null,
    media_mime_type: mediaMimeType || null,
    is_from_me: isFromMe,
    sender_type: isFromMe ? 'system' : 'client',
    ai_generated: false,
    reply_to_message_id: replyToMessageId,
  })
  .select()
  .maybeSingle();
```

### Por que isso funciona

A verificação de duplicatas já existe e é efetiva:

```typescript
// Linhas 4742-4752 - Verificação que já existe
const { data: existingMsg } = await supabaseClient
  .from('messages')
  .select('id')
  .eq('conversation_id', conversation.id)
  .eq('whatsapp_message_id', data.key.id)
  .maybeSingle();

if (existingMsg?.id) {
  logDebug('MESSAGE', 'Duplicate message ignored', {...});
  break;
}
```

---

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/evolution-webhook/index.ts` | Substituir `upsert` por `insert` |

---

## Detalhes da Correção

**Localização**: Linhas 4837-4856 do arquivo `evolution-webhook/index.ts`

**Mudança**:
- Remover o `upsert` com `onConflict`
- Usar `insert` simples (a verificação de duplicatas já existe antes)

---

## Risco e Rollback

| Aspecto | Avaliação |
|---------|-----------|
| Risco | Mínimo - voltando para código que funcionava |
| Rollback | N/A - esta é a correção do bug |
| Impacto | Imediato - mensagens voltarão a ser salvas |

---

## Resultado Esperado

```
ANTES (ERRO):
- Mensagem chega no webhook ✓
- Tenta salvar com upsert ✗ → ERRO 42P10
- Mensagem perdida ✗

DEPOIS (CORRIGIDO):
- Mensagem chega no webhook ✓
- Verifica se já existe ✓
- Salva com insert ✓
- Mensagem aparece no sistema ✓
```

