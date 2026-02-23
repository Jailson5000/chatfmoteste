

## Corrigir Download de Midia pelo Menu de Acoes

### Problema Encontrado

O botao "Baixar" no menu de acoes da mensagem (tres pontinhos) usa a funcao `handleDownloadMedia` que SEMPRE chama a Evolution API para descriptografar a midia. Isso ignora completamente o `media_url` da mensagem, que frequentemente ja eh uma URL publica do Storage (midia persistida).

Resultado: quando a midia original do WhatsApp ja expirou (apos ~48h), o download falha com "Falha ao baixar midia" mesmo que a copia esteja disponivel no Storage.

O `DocumentViewer`, `ImageViewer`, `AudioPlayer` e `VideoPlayer` ja tratam isso corretamente - eles verificam se a URL eh publica antes de tentar descriptografar. Mas o menu "Baixar" nao usa essa logica.

### Correcao

**Arquivo: `src/pages/Conversations.tsx` (funcao `handleDownloadMedia`)**

Adicionar verificacao do `media_url` da mensagem antes de chamar a Evolution API:

1. Buscar a mensagem pelo `whatsappMessageId` na lista de mensagens local
2. Se a mensagem tem `media_url` que eh uma URL publica do Storage, baixar diretamente dela
3. Se a URL eh de arquivo interno (`internal-chat-files`), gerar signed URL e baixar
4. Somente como fallback, chamar a Evolution API para descriptografar

```text
const handleDownloadMedia = useCallback(async (whatsappMessageId, conversationId, _fileName) => {
  try {
    toast({ title: "Baixando midia..." });

    // 1. Buscar mensagem local para verificar se ja tem media_url publica
    const msg = messages.find(m => m.whatsapp_message_id === whatsappMessageId);
    const mediaUrl = msg?.media_url;
    
    // 2. Se tem URL publica do Storage, baixar diretamente
    if (mediaUrl && isPublicStorageUrl(mediaUrl)) {
      const response = await fetch(mediaUrl);
      const blob = await response.blob();
      // ... gerar nome e baixar via blob
      return;
    }
    
    // 3. Se eh arquivo interno, usar signed URL
    if (mediaUrl && (mediaUrl.startsWith('internal-chat-files://') || mediaUrl.includes('/internal-chat-files/'))) {
      // ... extrair path, gerar signed URL, baixar
      return;
    }

    // 4. Fallback: descriptografar via Evolution API
    const response = await supabase.functions.invoke("evolution-api", { ... });
    // ... logica atual
  }
});
```

**Arquivo: `src/components/kanban/KanbanChatPanel.tsx` (mesma funcao)**

Aplicar a mesma correcao na funcao `handleDownloadMedia` do painel Kanban, que tem a mesma logica duplicada.

### O que muda

- Download de midias ja persistidas no Storage funciona mesmo quando a midia original do WhatsApp expirou
- Menos chamadas desnecessarias a Evolution API (mais rapido)
- Fallback para Evolution API continua funcionando para midias ainda nao persistidas
- Dois arquivos editados com a mesma correcao

