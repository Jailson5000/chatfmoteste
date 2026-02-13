
# Corrigir envio de mensagens WhatsApp Cloud e banner vermelho

## Problema 1: Banner vermelho "WhatsApp sem conexao"

O codigo em `instanceDisconnectedInfo` (linha 473-508) verifica se a conversa tem `whatsapp_instance_id`. Conversas de **WHATSAPP_CLOUD** nao usam instancia Evolution (o campo e `null`), mas o codigo so ignora `WIDGET`, `SITE`, `WEB`, `TRAY`. Falta adicionar os canais Meta na lista de excecao.

**Arquivo:** `src/pages/Conversations.tsx` (linha 478)

Adicionar `INSTAGRAM`, `FACEBOOK` e `WHATSAPP_CLOUD` na verificacao:
```typescript
if (['WIDGET', 'SITE', 'WEB', 'TRAY', 'INSTAGRAM', 'FACEBOOK', 'WHATSAPP_CLOUD'].includes(origin)) {
  return null;
}
```

---

## Problema 2: Mensagens nao sao enviadas para o WhatsApp

O handler principal de envio (`handleSendMessage`, linha 1338) coloca `WHATSAPP_CLOUD` na lista `nonWhatsAppOrigins` e depois trata TODAS essas origens como Widget/Site -- salvando direto no banco sem enviar para a API da Meta. O codigo de envio via `meta-api` so existe no handler de **retry** (linha 1616), nao no envio principal.

**Arquivo:** `src/pages/Conversations.tsx` (linha 1338)

Dentro do bloco `if (isNonWhatsAppConversation)`, adicionar verificacao para canais Meta ANTES de salvar direto no DB:

```typescript
if (isNonWhatsAppConversation) {
  const metaOrigins = ['INSTAGRAM', 'FACEBOOK', 'WHATSAPP_CLOUD'];
  const isMetaChannel = metaOrigins.includes(conversationOrigin);
  
  if (isMetaChannel) {
    // Meta channels: enviar via meta-api
    const response = await supabase.functions.invoke("meta-api", {
      body: {
        conversationId,
        content: messageToSend,
        messageType: "text",
      },
    });
    
    if (response.error || !response.data?.success) {
      throw new Error(response.data?.error || "Falha ao enviar mensagem");
    }
    
    // Atualizar mensagem temporaria para "sent"
    setMessages(prev => prev.map(m =>
      m.id === tempId
        ? { ...m, id: response.data.messageId || tempId, status: "sent" }
        : m
    ));
  } else {
    // Widget/Tray/Site: salvar direto no DB (codigo existente)
    ...
  }
}
```

Tambem aplicar a mesma correcao no handler de **envio de midia** (linha ~2220) que tem o mesmo problema.

---

## Resumo das alteracoes

| Arquivo | Linha(s) | O que muda |
|---------|----------|------------|
| `src/pages/Conversations.tsx` | ~478 | Adicionar canais Meta na lista de excecao do banner vermelho |
| `src/pages/Conversations.tsx` | ~1338 | Separar canais Meta do fluxo Widget/Site no envio de texto |
| `src/pages/Conversations.tsx` | ~2220 | Separar canais Meta do fluxo Widget/Site no envio de midia |

## Resultado esperado

1. Banner vermelho desaparece para conversas WhatsApp Cloud
2. Mensagens digitadas no painel sao enviadas via API da Meta para o WhatsApp do destinatario
3. Envio de midia tambem funciona para canais Meta
