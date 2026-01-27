
# Correção do Bloqueio de Áudio para Chat Web

## Problema Identificado

A partir da análise do código e das screenshots, identifiquei dois problemas distintos:

### 1. Kanban: Áudio sendo enviado para conversa de Site
- O botão de microfone aparece em conversa de **origem "Site"** (destacado em verde na imagem)
- A mensagem aparece como "Mensagem de áudio - Áudio enviado via WhatsApp" 
- **Causa**: A lógica `isWhatsAppConversation` tem um fallback que assume WhatsApp quando `origin` está vazio:
  ```typescript
  conversationOrigin === '' // Legacy: assume WhatsApp if origin is empty
  ```
- Além disso, pode haver inconsistência no valor de `origin` recebido pelo componente

### 2. Conversas: Mensagem de erro técnica
- O `AudioRecorder` é renderizado **sempre** (linha 4299), sem verificar o canal
- Quando o usuário tenta enviar áudio para Chat Web, aparece o erro técnico: "Evolution API retornou erro 400..."
- O erro vem da API porque não existe instância WhatsApp para conversa de Site

## Correções Propostas

### Arquivo 1: `src/components/kanban/KanbanChatPanel.tsx`

**Alteração 1**: Remover o fallback que assume WhatsApp quando origin vazio (linhas 1042-1046)

De:
```typescript
const isWhatsAppConversation = !isNonWhatsAppConversation && (
  conversationOrigin === 'WHATSAPP' ||
  (remoteJid && remoteJid.endsWith('@s.whatsapp.net')) ||
  conversationOrigin === '' // Legacy: assume WhatsApp if origin is empty
);
```

Para:
```typescript
// IMPORTANTE: Não assumir WhatsApp se origin vazio - requer confirmação explícita
const isWhatsAppConversation = !isNonWhatsAppConversation && (
  conversationOrigin === 'WHATSAPP' ||
  (remoteJid && remoteJid.endsWith('@s.whatsapp.net')) ||
  !!whatsappInstanceId // Usar whatsappInstanceId como critério mais seguro
);
```

**Alteração 2**: Melhorar mensagem de erro no `handleSendAudio` (linha 1890)

De:
```typescript
throw new Error("Chat Web aceita apenas mensagens de texto e imagens (sem áudio).");
```

Para:
```typescript
throw new Error("Não é possível enviar áudio para o Chat Web. Use apenas texto ou imagens.");
```

---

### Arquivo 2: `src/pages/Conversations.tsx`

**Alteração 1**: Adicionar variável `isWhatsAppConversation` usando `useMemo` 

Adicionar logo após a declaração de `selectedConversation` (aproximadamente linha 437):
```typescript
// Robust WhatsApp detection for audio button visibility
const isWhatsAppConversation = useMemo(() => {
  if (!selectedConversation) return false;
  const origin = (selectedConversation.origin || '').toUpperCase();
  const nonWhatsAppOrigins = ['WIDGET', 'TRAY', 'SITE', 'WEB'];
  if (nonWhatsAppOrigins.includes(origin)) return false;
  
  // Positive check: must be explicitly WhatsApp
  return origin === 'WHATSAPP' || 
    (selectedConversation.remote_jid?.endsWith('@s.whatsapp.net')) ||
    !!selectedConversation.whatsapp_instance_id;
}, [selectedConversation]);
```

**Alteração 2**: Esconder `AudioRecorder` para conversas não-WhatsApp (linhas 4050-4057 e 4298-4303)

De:
```tsx
{showAudioRecorder ? (
  <div className="w-full px-3 lg:px-4">
    <AudioRecorder
      onSend={handleSendAudioRecording}
      onCancel={() => setShowAudioRecorder(false)}
      disabled={isSending}
    />
  </div>
) : (
```

Para:
```tsx
{showAudioRecorder && isWhatsAppConversation ? (
  <div className="w-full px-3 lg:px-4">
    <AudioRecorder
      onSend={handleSendAudioRecording}
      onCancel={() => setShowAudioRecorder(false)}
      disabled={isSending}
    />
  </div>
) : (
```

E na seção mobile (linha 4298-4303):

De:
```tsx
<div className="flex gap-1">
  <AudioRecorder
    onSend={handleSendAudioRecording}
    onCancel={() => {}}
    disabled={isSending}
  />
```

Para:
```tsx
<div className="flex gap-1">
  {isWhatsAppConversation && (
    <AudioRecorder
      onSend={handleSendAudioRecording}
      onCancel={() => {}}
      disabled={isSending}
    />
  )}
```

**Alteração 3**: Melhorar mensagem de erro no `handleSendAudioRecording` (linha 2225)

De:
```typescript
throw new Error("Chat Web aceita apenas mensagens de texto (sem áudio). Use texto ou imagens.");
```

Para:
```typescript
throw new Error("Não é possível enviar áudio para o Chat Web. Use apenas texto ou imagens.");
```

---

## Resumo das Alterações

| Arquivo | Linha(s) | Alteração |
|---------|----------|-----------|
| `KanbanChatPanel.tsx` | 1042-1046 | Remover fallback que assume WhatsApp quando origin vazio |
| `KanbanChatPanel.tsx` | 1890 | Mensagem amigável de bloqueio |
| `Conversations.tsx` | ~437 | Adicionar `isWhatsAppConversation` com useMemo |
| `Conversations.tsx` | 4050 | Condicionar `showAudioRecorder` ao canal WhatsApp |
| `Conversations.tsx` | 4298-4303 | Esconder `AudioRecorder` mobile para não-WhatsApp |
| `Conversations.tsx` | 2225 | Mensagem amigável de bloqueio |

## Critério de Sucesso

1. Botão de microfone **não aparece** para conversas de Site/Widget/Tray
2. Se por algum motivo o áudio for enviado para Chat Web, mensagem amigável: "Não é possível enviar áudio para o Chat Web. Use apenas texto ou imagens."
3. Envio de áudio para WhatsApp continua funcionando normalmente
4. Zero regressões em texto, imagens e documentos

## Risco

- **Baixo**: Alterações focadas apenas na visibilidade do `AudioRecorder` e mensagens de erro
- Não afeta o fluxo de envio de áudio para WhatsApp (que já foi corrigido)
- Não afeta envio de texto/imagens para nenhum canal
