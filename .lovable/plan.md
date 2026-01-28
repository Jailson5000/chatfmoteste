
# Correção: Templates da IA com Mídia não Aparecem no Chat + Duplicação

## Problemas Identificados

Analisando as screenshots e o código, identifiquei dois problemas distintos mas relacionados:

### Problema 1: Templates com Mídia não Exibem Imagens no Chat MiauChat

**Causa raiz:** A função `executeTemplateTool` envia texto e mídia SEPARADAMENTE para o WhatsApp, mas salva apenas UMA mensagem no banco de dados.

```text
Fluxo atual:
┌─────────────────────────────────────────────────────────────┐
│ 1. IA chama send_template("Baixar extratos")                │
│ 2. executeTemplateTool extrai [IMAGE]url do conteúdo        │
│ 3. Envia TEXTO via Evolution API → recebe whatsapp_id_texto │
│ 4. Envia MÍDIA via Evolution API → recebe whatsapp_id_mídia │
│ 5. Salva UMA mensagem com whatsapp_id_texto e media_url     │
│ 6. Problema: mídia não tem whatsapp_message_id vinculado    │
│    então não consegue descriptografar via get_media         │
└─────────────────────────────────────────────────────────────┘
```

**Por que a imagem não aparece no chat:**
- A mensagem salva no banco tem `message_type: 'media'` e `media_url` com a URL pública do template
- Mas quando o `MessageBubble` tenta renderizar, ele usa o `whatsappMessageId` para descriptografar
- O `whatsappMessageId` salvo é do TEXTO, não da MÍDIA
- Resultado: a função `get_media` falha porque o ID não corresponde a uma mídia

### Problema 2: Mensagens Duplicadas no WhatsApp

**Causa raiz:** O fluxo `send.message` do Evolution API não está sendo ignorado adequadamente.

```text
Cenário de duplicação:
┌─────────────────────────────────────────────────────────────┐
│ 1. executeTemplateTool envia mídia para WhatsApp            │
│ 2. Evolution API dispara webhook 'send.message' com mídia   │
│ 3. evolution-webhook recebe evento                          │
│ 4. Tenta salvar nova mensagem (não encontra duplicata)      │
│ 5. Resultado: DUAS mensagens com mesma imagem no WhatsApp   │
│    (uma do ai-chat + uma do webhook)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Solução Proposta

### Correção 1: Salvar Mensagens de Mídia Separadamente

Modificar `executeTemplateTool` em `supabase/functions/ai-chat/index.ts`:

**Antes:**
```typescript
// Salva UMA mensagem com ambos texto e mídia
const { data: savedMsg } = await supabase.from("messages").insert({
  whatsapp_message_id: whatsappMessageId, // ID do texto apenas
  content: finalContent,
  message_type: finalMediaUrl ? 'media' : 'text',
  media_url: finalMediaUrl,
  ...
});
```

**Depois:**
```typescript
// 1. Se tem TEXTO, salvar mensagem de texto
if (finalContent) {
  await supabase.from("messages").insert({
    whatsapp_message_id: whatsappMessageId, // ID do texto
    content: finalContent,
    message_type: 'text',
    // SEM media_url no texto
    ...
  });
}

// 2. Se tem MÍDIA, salvar mensagem de mídia SEPARADA
if (finalMediaUrl) {
  await supabase.from("messages").insert({
    whatsapp_message_id: mediaMessageId, // ID da mídia (do sendMedia)
    content: null, // Mídia não precisa de content
    message_type: 'image' | 'video' | 'document',
    media_url: finalMediaUrl,
    ...
  });
}
```

### Correção 2: Evitar Duplicação no Webhook

O `evolution-webhook` já tem verificação de duplicatas por `whatsapp_message_id`, mas precisamos garantir que:

1. O `mediaMessageId` seja capturado corretamente do envio de mídia
2. Esse ID seja salvo na mensagem de mídia para que o webhook reconheça como duplicata

Atualmente a verificação existe em linha 4154-4163:
```typescript
const { data: existingMsg } = await supabaseClient
  .from('messages')
  .select('id')
  .eq('conversation_id', conversation.id)
  .eq('whatsapp_message_id', data.key.id)
  .maybeSingle();

if (existingMsg?.id) {
  logDebug('MESSAGE', `Duplicate message ignored...`);
  break;
}
```

Com a correção 1, quando salvamos o `mediaMessageId` correto, o webhook vai encontrar a duplicata e ignorar.

### Correção 3: Usar URL Pública para Mídia de Templates

Para templates que usam URLs públicas do Supabase Storage (como `https://...supabase.co/storage/v1/object/public/...`), NÃO precisamos de descriptografia. O `MessageBubble` deve detectar isso:

**Em `src/components/conversations/MessageBubble.tsx`:**

```typescript
// No ImageViewer/VideoPlayer/DocumentViewer
// Não precisa de descriptografia se:
// 1. URL é pública (não é WhatsApp encrypted)
// 2. Ou mensagem é ai_generated com URL de storage
const isPublicUrl = src.includes('supabase.co/storage/') || 
                    (!src.includes('.enc') && !src.includes('mmg.whatsapp.net'));
const needsDecryption = !isPublicUrl && !!whatsappMessageId && !!conversationId;
```

---

## Arquivos a Modificar

### 1. `supabase/functions/ai-chat/index.ts`

**Função `executeTemplateTool` (linhas ~1764-2050):**
- Separar salvamento de texto e mídia
- Capturar e usar o `mediaMessageId` corretamente
- Melhorar logging para debug

### 2. `src/components/conversations/MessageBubble.tsx`

**Componentes `ImageViewer`, `VideoPlayer`, `DocumentViewer`:**
- Detectar URLs públicas que não precisam de descriptografia
- Exibir mídia diretamente quando URL é acessível

---

## Testes a Realizar

1. **Enviar template com imagem via IA**
   - [ ] Verificar que imagem aparece no chat MiauChat
   - [ ] Verificar que imagem aparece no WhatsApp do cliente
   - [ ] Verificar que NÃO há duplicação

2. **Verificar banco de dados**
   - [ ] Template com texto+imagem cria 2 mensagens (texto e imagem separadas)
   - [ ] Cada mensagem tem seu próprio `whatsapp_message_id`

3. **Testar diferentes tipos de mídia**
   - [ ] Template com imagem
   - [ ] Template com vídeo
   - [ ] Template com documento PDF
