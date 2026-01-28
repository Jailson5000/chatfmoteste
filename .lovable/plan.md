
# Correção: Templates da IA não Aparecem no Chat

## Problema Identificado

### Causa Raiz Confirmada nos Logs
```text
ERROR [AI Chat] Failed to save template media message: {
  code: "PGRST204",
  message: "Could not find the 'metadata' column of 'messages' in the schema cache"
}
```

O código atual tenta inserir dados na coluna `metadata` da tabela `messages`, mas **essa coluna não existe**.

### Fluxo Atual (Quebrado)

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 1. IA chama send_template("Baixar extratos")                        │
│ 2. executeTemplateTool:                                              │
│    → Envia TEXTO via WhatsApp (OK) ✓                                 │
│    → Envia MÍDIA via WhatsApp (OK) ✓                                 │
│    → Tenta salvar TEXTO no banco com "metadata" → ERRO ✗            │
│    → Tenta salvar MÍDIA no banco com "metadata" → ERRO ✗            │
│ 3. Resultado:                                                        │
│    • Mensagens chegam no WhatsApp do cliente ✓                       │
│    • Mensagens NÃO são salvas no banco de dados ✗                   │
│    • Mensagens NÃO aparecem no chat do MiauChat ✗                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Por que algumas mensagens antigas funcionam?
As mensagens antigas com imagem (de 16-17/01) foram criadas antes da modificação que adicionou o campo `metadata` no insert. O webhook do Evolution API (`evolution-webhook`) também cria mensagens, mas sem esse campo problemático.

## Solução

### Correção 1: Remover campo `metadata` dos inserts

O campo `metadata` não existe na tabela `messages`. Precisamos removê-lo de AMBOS os inserts (texto e mídia) na função `executeTemplateTool`.

**Arquivo:** `supabase/functions/ai-chat/index.ts`

**Linhas 2005-2023 (insert de texto):**
```typescript
// ANTES (quebrado)
const { data: savedTextMsg, error: textSaveError } = await supabase.from("messages").insert({
  // ... campos válidos ...
  metadata: {  // ← ERRO: coluna não existe!
    template_id: matchedTemplate.id,
    template_name: matchedTemplate.name,
    sent_via_whatsapp: whatsappSendSuccess,
    has_companion_media: !!finalMediaUrl
  }
}).select("id").single();

// DEPOIS (corrigido)
const { data: savedTextMsg, error: textSaveError } = await supabase.from("messages").insert({
  conversation_id: conversationId,
  law_firm_id: lawFirmId,
  whatsapp_message_id: whatsappTextMessageId,
  content: finalContent,
  sender_type: "ai",
  is_from_me: true,
  message_type: 'text',
  media_url: null,
  media_mime_type: null,
  status: whatsappSendSuccess ? "sent" : "delivered",
  ai_generated: true,
  // REMOVIDO: metadata (coluna não existe)
}).select("id").single();
```

**Linhas 2040-2058 (insert de mídia):**
```typescript
// ANTES (quebrado)
const { data: savedMediaMsg, error: mediaSaveError } = await supabase.from("messages").insert({
  // ... campos válidos ...
  metadata: {  // ← ERRO: coluna não existe!
    template_id: matchedTemplate.id,
    template_name: matchedTemplate.name,
    sent_via_whatsapp: whatsappSendSuccess,
    is_public_url: ...
  }
}).select("id").single();

// DEPOIS (corrigido)
const { data: savedMediaMsg, error: mediaSaveError } = await supabase.from("messages").insert({
  conversation_id: conversationId,
  law_firm_id: lawFirmId,
  whatsapp_message_id: whatsappMediaMessageId,
  content: null,
  sender_type: "ai",
  is_from_me: true,
  message_type: mediaMessageType,
  media_url: finalMediaUrl,
  media_mime_type: mediaMimeType,
  status: whatsappSendSuccess ? "sent" : "delivered",
  ai_generated: true,
  // REMOVIDO: metadata (coluna não existe)
}).select("id").single();
```

### Correção 2: Melhorar renderização de mídia pública

O componente `MessageBubble` já possui a lógica `isPublicStorageUrl()` para detectar URLs públicas, mas vou garantir que está funcionando corretamente para templates.

**Arquivo:** `src/components/conversations/MessageBubble.tsx`

A função `isPublicStorageUrl` já existe (linha 794-796) e deve funcionar. A verificação é:
```typescript
function isPublicStorageUrl(url: string): boolean {
  return url.includes('supabase.co/storage/v1/object/public/') || 
         url.includes('.supabase.co/storage/v1/object/public/');
}
```

Isso já cobre as URLs do bucket `template-media` usado pelos templates.

## Arquivos a Modificar

1. **`supabase/functions/ai-chat/index.ts`**
   - Remover campo `metadata` do insert de texto (linhas 2017-2022)
   - Remover campo `metadata` do insert de mídia (linhas 2052-2057)
   - Manter logs de debug para rastrear template_id

## Resultado Esperado

Após a correção:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 1. IA chama send_template("Baixar extratos")                        │
│ 2. executeTemplateTool:                                              │
│    → Envia TEXTO via WhatsApp (OK) ✓                                 │
│    → Envia MÍDIA via WhatsApp (OK) ✓                                 │
│    → Salva TEXTO no banco (OK) ✓                                    │
│    → Salva MÍDIA no banco (OK) ✓                                    │
│ 3. Resultado:                                                        │
│    • Mensagens chegam no WhatsApp do cliente ✓                       │
│    • Mensagens são salvas no banco de dados ✓                       │
│    • Mensagens aparecem no chat do MiauChat ✓                       │
│    • Imagens/vídeos renderizam diretamente (URL pública) ✓          │
└─────────────────────────────────────────────────────────────────────┘
```

## Considerações de Segurança

- Não haverá regressões - apenas removemos um campo que causava erro
- O fluxo de envio de mídia pelo atendente (`handleSendMedia`) já funciona corretamente, pois não usa o campo `metadata`
- O webhook (`evolution-webhook`) também não usa esse campo

## Testes Recomendados

1. Enviar template com imagem via IA → verificar se aparece no chat e WhatsApp
2. Enviar template com vídeo via IA → verificar se aparece no chat e WhatsApp
3. Enviar template só texto via IA → verificar se aparece normalmente
4. Verificar que mensagens antigas continuam funcionando
