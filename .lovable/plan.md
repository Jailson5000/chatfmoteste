
# Correcao: Imagens e PDFs Perdem Metadados no Debounce

## Problema Encontrado

Confirmei nos dados do banco: quando o cliente envia imagem + texto rapidamente (dentro de 10 segundos), o sistema de debounce agrupa as mensagens mas **sobrescreve os metadados da imagem** com os da mensagem de texto (que nao tem mime type nem message key).

Exemplo real do banco:
- Queue `54693ee9`: 2 mensagens `[image, text("e agora?")]` --> `document_mime_type: ""`, `whatsapp_message_key: null`
- O texto "e agora?" chegou depois e apagou o mime type `image/jpeg` e a key da imagem

O processador da fila verifica `if (documentMimeType?.startsWith('image/'))` mas encontra string vazia, entao nao baixa a imagem. A IA nao recebe nada visual.

## Solucao: Preservar metadados de midia no debounce

### Mudanca 1: `supabase/functions/evolution-webhook/index.ts` - Funcao `queueMessageForAIProcessing`

No bloco de **update** do queue existente (linha ~1168), em vez de sempre sobrescrever `document_mime_type`, `document_file_name` e `whatsapp_message_key`, preservar os valores anteriores se os novos estiverem vazios:

```text
// ANTES (sobrescreve sempre):
metadata: {
  document_mime_type: context.documentMimeType,
  document_file_name: context.documentFileName,
  whatsapp_message_key: context.whatsappMessageKey,
}

// DEPOIS (preserva se novo valor vazio):
metadata: {
  ...existingMetadata,  // preservar valores anteriores
  contact_name: context.contactName,
  contact_phone: context.contactPhone,
  remote_jid: context.remoteJid,
  instance_id: context.instanceId,
  instance_name: context.instanceName,
  client_id: context.clientId,
  // Preservar metadados de midia: so sobrescrever se nova mensagem tem midia
  document_mime_type: context.documentMimeType || existingMetadata?.document_mime_type,
  document_file_name: context.documentFileName || existingMetadata?.document_file_name,
  whatsapp_message_key: context.whatsappMessageKey || existingMetadata?.whatsapp_message_key,
}
```

Para isso, precisamos buscar o `metadata` existente no SELECT inicial. Alterar a linha 1147:

```text
// ANTES:
.select('id, messages, message_count')

// DEPOIS:
.select('id, messages, message_count, metadata')
```

E usar `existingQueue.metadata` ao montar o update.

### Mudanca 2: Tambem armazenar info de midia POR MENSAGEM no array `messages`

Alem de preservar os metadados no nivel do queue item, armazenar o mime type e key diretamente em cada mensagem individual. Isso permite ao processador identificar QUAL mensagem tem midia:

```text
// No messageData (linha ~1130):
const messageData = {
  content: context.messageContent,
  type: context.messageType,
  timestamp: new Date().toISOString(),
  // Adicionar info de midia por mensagem
  mimeType: context.documentMimeType || undefined,
  fileName: context.documentFileName || undefined,
  messageKey: context.whatsappMessageKey || undefined,
};
```

### Mudanca 3: Processador da fila - buscar midia da mensagem correta

No processador (linha ~1480), alem de verificar os metadados do nivel do queue item, tambem verificar se alguma mensagem individual tem info de midia:

```text
// Se metadata de nivel superior nao tem, buscar nas mensagens individuais
if (!documentMimeType && messages.length > 0) {
  const mediaMessage = messages.find(m => m.mimeType);
  if (mediaMessage) {
    documentMimeType = mediaMessage.mimeType;
    documentFileName = mediaMessage.fileName;
    whatsappMessageKey = mediaMessage.messageKey;
  }
}
```

## Resumo

| Mudanca | Local | Impacto |
|---------|-------|---------|
| Preservar metadados no debounce update | queueMessageForAIProcessing | Mime type nao se perde |
| Armazenar midia por mensagem | messageData | Cada mensagem carrega sua info |
| Fallback no processador | processQueueItem | Busca midia de qualquer mensagem |

## Resultado Esperado

- Cliente envia imagem + texto --> ambos ficam na fila, mime type preservado
- Processador baixa base64 da imagem e envia para IA via multimodal
- IA descreve a imagem e responde ao texto
- PDFs tambem preservam seus metadados no debounce
- Nenhuma funcionalidade existente e quebrada
