
# Plano: Corrigir Envio e Recebimento de Áudio/Imagens

## Problema Reportado
1. O atendente não recebe as imagens enviadas pelo cliente
2. O cliente não recebe os áudios enviados pelo atendente

## Diagnóstico Técnico

### Análise dos Dados

Consultando o banco de dados, encontrei o padrão:

```
# Mensagens ENVIADAS (is_from_me=true):
audio.webm       | media_url: <nil> ❌
image.jpeg       | media_url: <nil> ❌

# Mensagens RECEBIDAS (is_from_me=false):
áudio do cliente | media_url: https://mmg.whatsapp.net/... ✅
imagem do cliente| media_url: https://mmg.whatsapp.net/... ✅
```

### Causa Raiz

**BUG 1: Edge Function `evolution-api` (send_media)**

A função salva mídia no banco sem capturar a URL retornada pela Evolution API:

```typescript
// Código atual (linha 2309):
media_url: body.mediaUrl || null,  // ❌ Sempre null quando usa base64!
```

A Evolution API retorna:
```json
{"message":{"imageMessage":{"url":"https://mmg.whatsapp.net/..."}}}
```

Mas o código **não extrai essa URL** para salvar no banco.

---

**BUG 2: MessageBubble.tsx - `canFetchWithoutUrl` incompleto**

O sistema pode buscar mídia sem URL (via `get_media`), mas só está habilitado para imagens e documentos:

```typescript
// Código atual (linha 1533):
(messageType === "image" || messageType === "document")  
// ❌ Falta: "audio", "video", "ptt"
```

---

**BUG 3: MessageBubble.tsx - Renderização de Áudio exige URL**

```typescript
// Código atual (linha 1490):
if (isAudio && mediaUrl) {  // ❌ Exige mediaUrl mesmo tendo whatsapp_message_id
```

Deveria ser:
```typescript
if (isAudio && (mediaUrl || canFetchWithoutUrl)) {
```

---

## Solução

### Arquivo 1: `supabase/functions/evolution-api/index.ts`

**Localização:** Linhas 2295-2317

**Alteração:** Extrair a URL da resposta da Evolution API e salvá-la no banco

```typescript
// ANTES (linhas 2295-2316):
const sendData = await sendResponse.json();
const whatsappMessageId = sendData.key?.id || ...;

if (conversationId) {
  await supabaseClient.from("messages").insert({
    ...
    media_url: body.mediaUrl || null,  // ❌ Sempre null
    ...
  });
}

// DEPOIS:
const sendData = await sendResponse.json();
const whatsappMessageId = sendData.key?.id || ...;

// Extrair URL de mídia da resposta (Evolution API retorna no payload)
const extractedMediaUrl = 
  sendData.message?.imageMessage?.url ||
  sendData.message?.audioMessage?.url ||
  sendData.message?.videoMessage?.url ||
  sendData.message?.documentMessage?.url ||
  body.mediaUrl || 
  null;

if (conversationId) {
  await supabaseClient.from("messages").insert({
    ...
    media_url: extractedMediaUrl,  // ✅ URL da Evolution API
    ...
  });
}
```

---

### Arquivo 2: `src/components/conversations/MessageBubble.tsx`

**Alteração 1:** Expandir `canFetchWithoutUrl` para incluir áudio e vídeo

```typescript
// ANTES (linhas 1466-1470 e 1529-1533):
const canFetchWithoutUrl =
  !mediaUrl &&
  !!whatsappMessageId &&
  !!conversationId &&
  (messageType === "image" || messageType === "document");

// DEPOIS:
const canFetchWithoutUrl =
  !mediaUrl &&
  !!whatsappMessageId &&
  !!conversationId &&
  (messageType === "image" || messageType === "document" || 
   messageType === "audio" || messageType === "video" || messageType === "ptt");
```

**Alteração 2:** Permitir renderização de áudio/vídeo sem URL

```typescript
// ANTES (linhas 1490 e 1502):
if (isAudio && mediaUrl) { ... }
if (isVideo && mediaUrl) { ... }

// DEPOIS:
if (isAudio && (mediaUrl || canFetchWithoutUrl)) { ... }
if (isVideo && (mediaUrl || canFetchWithoutUrl)) { ... }
```

---

### Arquivo 3: `src/components/kanban/KanbanChatPanel.tsx`

O Kanban **reutiliza** o componente `MessageBubble`, então a correção acima já resolve o problema. Não é necessário alterar o KanbanChatPanel diretamente para a renderização de mídia.

---

## Arquivos a Modificar

| Arquivo | Alterações |
|---------|------------|
| `supabase/functions/evolution-api/index.ts` | Extrair e salvar `media_url` da resposta da Evolution API |
| `src/components/conversations/MessageBubble.tsx` | Expandir `canFetchWithoutUrl` para áudio/vídeo + ajustar condições de renderização |

---

## Fluxo Corrigido

```text
ENVIO DE MÍDIA (Atendente → Cliente):
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Frontend       │───▸│  evolution-api   │───▸│  Evolution API  │
│  (base64)       │    │  (send_media)    │    │                 │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │
                                 Resposta com URL ◄─────┘
                                                        │
                       ┌──────────────────┐    ┌────────▼────────┐
                       │  DB: messages    │◄───│  Extrai URL do  │
                       │  media_url: ✅   │    │  sendData       │
                       └──────────────────┘    └─────────────────┘

EXIBIÇÃO DE MÍDIA (Cliente/Atendente vê):
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  MessageBubble  │───▸│  Tem media_url?  │───▸│  Exibe direto   │
│                 │    │     ✅           │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │ ❌
                              ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Tem whatsapp_id? │───▸│  Busca via      │
                       │ + canFetchNoUrl? │    │  get_media API  │
                       │     ✅           │    │                 │
                       └──────────────────┘    └─────────────────┘
```

---

## Impacto Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Áudio enviado pelo atendente | ❌ Não aparece para o cliente | ✅ Aparece corretamente |
| Imagem enviada pelo atendente | ❌ Pode não aparecer | ✅ Aparece corretamente |
| Áudio recebido do cliente (sem URL local) | ❌ Não renderiza | ✅ Busca via get_media |
| Vídeo enviado/recebido | ❌ Pode falhar | ✅ Funciona com fallback |

---

## Considerações de Compatibilidade

1. **Mensagens antigas sem `media_url`:** O sistema já suporta buscar via `get_media` usando `whatsapp_message_id`, então mensagens antigas também serão corrigidas.

2. **Sem regressão:** As alterações são aditivas (expandem comportamento) e não quebram fluxos existentes.

3. **Deploy:** Após editar a edge function, ela será automaticamente deployada.
