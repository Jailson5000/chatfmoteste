
# Plano: Otimização de Performance do Sistema de Mensagens

## Análise dos Gargalos Identificados

### 1. Envio de Mensagens de Texto

| Etapa | Tempo Atual | Problema |
|-------|-------------|----------|
| Frontend → Edge Function | ~200ms | OK |
| Edge Function → Supabase (busca conversa) | ~100-300ms | 2 queries separadas |
| Edge Function → Evolution API | ~500-2000ms | **Gargalo principal** |
| Evolution → WhatsApp | ~200-500ms | Externo |
| DB Insert mensagem | ~100ms | OK |

**Diagnóstico:** O sistema já usa `send_message_async` que retorna em ~200ms usando background tasks, mas a tela Conversations usa `send_message` síncrono que aguarda resposta completa.

### 2. Envio de Áudio

| Etapa | Tempo Atual | Problema |
|-------|-------------|----------|
| Gravação (browser) | ~1-2s | OK |
| Upload Storage | ~500-2000ms | **Tamanho do base64** |
| Edge Function | ~1500ms | Verifica connectionState antes de enviar |
| Evolution API | ~2000-5000ms | **Processamento de áudio no servidor** |

**Problemas identificados:**
1. **Verificação de connectionState síncrona** antes de enviar áudio (linhas 2284-2318)
2. **Timeout conservador** de 60s para áudio
3. **Não usa background task** - aguarda resposta completa

### 3. Envio de Imagens/Documentos

| Etapa | Tempo Atual | Problema |
|-------|-------------|----------|
| Upload Storage | ~300-1000ms | OK para tamanhos normais |
| Edge Function | ~500-1500ms | Síncrono |
| Evolution API | ~1000-3000ms | Depende do tamanho |

**Problemas identificados:**
1. **Não usa background task** - aguarda resposta completa
2. **Upload duplo** - primeiro para Storage, depois base64 para Evolution

### 4. Carregamento de Mídia (Descriptografia)

| Etapa | Tempo Atual | Problema |
|-------|-------------|----------|
| UI renderiza | ~50ms | OK |
| IndexedDB cache check | ~10ms | OK |
| Edge Function get_media | ~500-2000ms | **Chamada por mídia** |
| Evolution getBase64FromMediaMessage | ~1000-3000ms | **Externo** |

**Problemas identificados:**
1. **Descriptografia sob demanda** - cada áudio/imagem faz chamada separada
2. **Cache apenas client-side** - se limpar cache, refaz tudo

---

## Soluções Propostas (Por Prioridade)

### PRIORIDADE ALTA: Envio Assíncrono Universal

**Impacto:** Reduz tempo de resposta de ~3s para ~200ms

**Mudança 1:** Usar `send_message_async` em vez de `send_message`

```typescript
// Conversations.tsx - handleSendMessage
// ANTES: action: "send_message" (síncrono, ~3s)
// DEPOIS: action: "send_message_async" (assíncrono, ~200ms)
```

**Mudança 2:** Criar `send_media_async` para mídia

```typescript
// evolution-api/index.ts
case "send_media_async": {
  // 1. Valida parâmetros
  // 2. Cria mensagem temporária no DB (status: "sending")
  // 3. Retorna imediatamente (~200ms)
  // 4. Background task faz o envio real
}
```

### PRIORIDADE ALTA: Remover Verificação connectionState para Áudio

**Impacto:** Reduz ~300-500ms por envio de áudio

O código atual faz uma verificação síncrona antes de enviar:

```typescript
// ATUAL (linhas 2284-2318): 
try {
  const stateResp = await fetchWithTimeout(connectionState/...);
  // ... verifica estado
}
```

**Solução:** Remover essa verificação - se a instância estiver desconectada, o envio falhará naturalmente e será tratado pelo error handling.

### PRIORIDADE MÉDIA: Optimistic Updates Consistentes

**Impacto:** Feedback visual instantâneo

O sistema já tem optimistic updates para texto, mas não para mídia:

```typescript
// Conversations.tsx linha 1963:
// "Do NOT add optimistic message here - backend already inserted via send_media"
```

**Solução:** Adicionar mensagem otimista com blob URL para preview imediato:

```typescript
// Adicionar mensagem local com status "sending"
const tempMessage = {
  id: tempId,
  content: body.caption || `[${mediaType}]`,
  media_url: blobUrl, // Preview local
  status: "sending",
  ...
};
setMessages(prev => [...prev, tempMessage]);
```

### PRIORIDADE MÉDIA: Pré-carregar Mídia Visível

**Impacto:** Reduz espera ao abrir conversa com mídia

```typescript
// useMessagesWithPagination.tsx
// Após carregar mensagens, pré-carregar mídia dos últimos 5 itens
useEffect(() => {
  const mediaMessages = messages
    .filter(m => m.media_url && isEncryptedMedia(m.media_url))
    .slice(-5); // Últimas 5 mídias
  
  mediaMessages.forEach(m => prefetchMedia(m.whatsapp_message_id));
}, [messages]);
```

### PRIORIDADE BAIXA: Cache de Mídia no Backend

**Impacto:** Reduz chamadas repetidas à Evolution API

Atualmente, cada descriptografia vai até a Evolution API. Uma tabela cache poderia armazenar:

```sql
CREATE TABLE media_cache (
  whatsapp_message_id TEXT PRIMARY KEY,
  base64_data TEXT,
  mime_type TEXT,
  cached_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days')
);
```

---

## Arquivos a Modificar

| Arquivo | Mudança | Impacto |
|---------|---------|---------|
| `src/pages/Conversations.tsx` | Usar `send_message_async` | ⚡ Alto |
| `src/components/kanban/KanbanChatPanel.tsx` | Usar `send_message_async` | ⚡ Alto |
| `supabase/functions/evolution-api/index.ts` | Criar `send_media_async`, remover connectionState check | ⚡ Alto |
| `src/pages/Conversations.tsx` | Optimistic updates para mídia | 🔶 Médio |
| `src/hooks/useMessagesWithPagination.tsx` | Pré-carregamento de mídia | 🔶 Médio |

---

## Fluxo Otimizado

```
ANTES (SÍNCRONO):
┌─────────────────────────────────────────────────────────────────────────┐
│ Usuário clica "Enviar" ──→ Edge Function ──→ Evolution API ──→ DB      │
│                                                                         │
│ [====== 3-5 segundos de espera ======]                                  │
│                                                                         │
│ UI desbloqueia                                                          │
└─────────────────────────────────────────────────────────────────────────┘

DEPOIS (ASSÍNCRONO):
┌─────────────────────────────────────────────────────────────────────────┐
│ Usuário clica "Enviar" ──→ Edge Function                                │
│                              ↓                                          │
│ [200ms] ←── Retorna tempId ───┘                                         │
│                                                                         │
│ UI mostra "enviando..." ←── Optimistic Update                           │
│                                                                         │
│ Background: Evolution API ──→ DB Update ──→ Realtime ──→ UI atualiza   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Métricas Esperadas

| Operação | Antes | Depois | Melhoria |
|----------|-------|--------|----------|
| Envio de texto | ~3s | ~200ms | **15x** |
| Envio de áudio | ~5s | ~300ms | **16x** |
| Envio de imagem | ~3s | ~250ms | **12x** |
| Feedback visual | ~3s | ~50ms | **60x** |

---

## Seção Técnica: Implementação Detalhada

### 1. Nova Action `send_media_async`

```typescript
case "send_media_async": {
  const startTime = Date.now();
  
  // Validar parâmetros (mesmo código atual)
  // ...
  
  // Criar mensagem temporária no DB
  const tempMessageId = crypto.randomUUID();
  const { data: insertedMessage } = await supabaseClient
    .from("messages")
    .insert({
      id: tempMessageId,
      conversation_id: conversationId,
      content: body.caption || `📎 ${body.fileName || body.mediaType}`,
      message_type: body.mediaType,
      media_url: body.mediaUrl, // Storage URL para preview
      media_mime_type: body.mimeType,
      is_from_me: true,
      sender_type: "human",
      status: "sending",
    })
    .select()
    .single();

  // Background task para envio real
  const backgroundSend = async () => {
    try {
      // Enviar para Evolution API (código existente)
      // ...
      
      // Atualizar mensagem com whatsapp_message_id real
      await supabaseClient
        .from("messages")
        .update({ 
          whatsapp_message_id: realId,
          media_url: evolutionMediaUrl, // URL real do WhatsApp
          status: "sent"
        })
        .eq("id", tempMessageId);
    } catch (error) {
      await supabaseClient
        .from("messages")
        .update({ status: "failed" })
        .eq("id", tempMessageId);
    }
  };

  EdgeRuntime.waitUntil(backgroundSend());

  // Retornar imediatamente
  return new Response(JSON.stringify({
    success: true,
    messageId: tempMessageId,
    async: true,
  }), { headers: corsHeaders });
}
```

### 2. Modificação no Frontend

```typescript
// handleSendMedia (Conversations.tsx)
const response = await supabase.functions.invoke("evolution-api", {
  body: {
    action: "send_media_async", // ← Mudança aqui
    conversationId: selectedConversationId,
    mediaType,
    mediaBase64: base64,
    mediaUrl: storageUrl,
    mimeType: file.type,
    fileName: file.name,
  },
});

// Adicionar optimistic update
if (response.data?.success) {
  const tempMessage = {
    id: response.data.messageId,
    content: mediaPreview.file?.name || `[${mediaType}]`,
    media_url: blobUrl, // Local preview
    status: "sending",
    is_from_me: true,
    created_at: new Date().toISOString(),
  };
  setMessages(prev => [...prev, tempMessage]);
}
```

---

## Prevenção de Regressões

1. **Fallback síncrono** - Se `send_*_async` falhar, sistema continua funcionando
2. **Status tracking** - Mensagens mostram estado real (sending → sent → delivered)
3. **Retry automático** - Frontend pode reenviar mensagens com status "failed"
4. **Realtime como fonte de verdade** - UI sempre sincroniza via WebSocket
5. **Compatibilidade** - Código antigo (`send_message`) continua funcionando

---

## Próximos Passos

1. **Fase 1:** Implementar `send_media_async` + modificar frontend
2. **Fase 2:** Migrar texto para `send_message_async` consistentemente
3. **Fase 3:** Adicionar pré-carregamento de mídia
4. **Fase 4:** (Opcional) Cache de mídia no backend
