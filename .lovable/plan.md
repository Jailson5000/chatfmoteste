
# Corrigir Mensagens de Template Recebidas Aparecendo Vazias

## Problema Identificado

A mensagem vazia que aparece no chat (18:14) veio pelo webhook da Evolution API com `whatsapp_message_id: A68FDCD771D0B0754C`, mas o conteudo foi salvo como string vazia (`""`).

**Causa raiz**: O webhook da Evolution API processa mensagens atraves de uma cadeia de `if/else if` que verifica tipos especificos (`conversation`, `extendedTextMessage`, `imageMessage`, `templateMessage`, etc.). Se a mensagem chega em um formato nao reconhecido, `messageContent` permanece como `""` e e salvo assim no banco -- sem nenhum fallback ou log de diagnostico.

Templates podem chegar em formatos variados dependendo da versao da Evolution API e do tipo de template (ex: `highlyStructuredMessage`, `protocolMessage`, ou formatos nao-hidratados). Se nenhum dos handlers especificos reconhece o formato, a mensagem fica vazia.

## Alteracoes Planejadas

### 1. Adicionar fallback para mensagens com conteudo vazio (`evolution-webhook/index.ts`)

Apos todos os blocos `if/else if` de extracao de conteudo (apos a linha ~4935, antes de salvar no banco), adicionar logica de fallback:

```typescript
// FALLBACK: If messageContent is still empty after all type checks,
// try to extract something from the raw message payload
if (!messageContent && !mediaUrl && data.message) {
  const rawMessage = JSON.stringify(data.message);
  
  // Log the unknown format for future debugging
  logDebug('UNKNOWN_TYPE', 'Message type not recognized - raw payload', {
    requestId,
    messageKeys: Object.keys(data.message).join(','),
    rawPreview: rawMessage.slice(0, 500),
  });
  
  // Try to find any text content in the raw payload
  const textMatch = rawMessage.match(/"(?:text|body|content|caption|hydratedContentText|conversation)"\s*:\s*"([^"]{3,})"/);
  if (textMatch) {
    messageContent = textMatch[1];
  } else {
    messageContent = '[Mensagem recebida - formato nao suportado]';
  }
}
```

### 2. Adicionar marcador `[template:]` em templates recebidos (`evolution-webhook/index.ts`)

No handler de `templateMessage` (linha ~4807), apos extrair o conteudo, prefixar com o marcador para que o `MessageBubble` renderize como card estilizado:

```typescript
// Apos extrair messageContent do template (linha ~4879)
const tplId = template.templateId || hydrated?.templateId || 'template';
if (messageContent.trim()) {
  messageContent = `[template: ${tplId}]\n${messageContent}`;
}
```

### 3. Tratar templates recebidos no meta-webhook (`meta-webhook/index.ts`)

Na funcao `processWhatsAppCloudEntry` (linha ~619-651), o webhook do WhatsApp Cloud tambem nao trata mensagens do tipo `button` (resposta a botao de template). Adicionar handlers para:

```typescript
} else if (msg.type === "button") {
  // User replied to a template button
  content = msg.button?.text || msg.button?.payload || "[Resposta de botao]";
} else if (msg.type === "interactive") {
  // Interactive message response
  const interactive = msg.interactive;
  if (interactive?.type === "button_reply") {
    content = interactive.button_reply?.title || "[Resposta interativa]";
  } else if (interactive?.type === "list_reply") {
    content = interactive.list_reply?.title || "[Selecao de lista]";
  } else {
    content = `[Mensagem interativa: ${interactive?.type || 'desconhecido'}]`;
  }
}
```

### 4. Fallback no meta-webhook para mensagens vazias

Apos a cadeia de `if/else` no meta-webhook, adicionar fallback similar:

```typescript
// After all type checks, if content is still empty
if (!content && !mediaId) {
  console.warn("[meta-webhook] Empty content for message type:", msg.type, 
    "Raw keys:", Object.keys(msg).join(','),
    "Raw preview:", JSON.stringify(msg).slice(0, 300));
  content = `[${msg.type || 'mensagem'}]`;
}
```

## Resumo de alteracoes

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| `supabase/functions/evolution-webhook/index.ts` | Backend | Fallback para conteudo vazio + marcador `[template:]` em templates recebidos |
| `supabase/functions/meta-webhook/index.ts` | Backend | Handlers para `button` e `interactive` + fallback para conteudo vazio |

## O que NAO muda
- Renderizacao de templates no frontend (ja funciona com o marcador `[template:]`)
- Preview de criacao de templates
- Envio de templates (ja corrigido anteriormente)
- Facebook e Instagram (sem alteracoes)
