
# Correção: Áudios se sobrescrevendo na conversa

## Problemas identificados

### 1. `handleReply` invalida `memo(MessageBubble)` a cada mensagem
Em `src/pages/Conversations.tsx` (linha 936-941), o callback `handleReply` depende de `[messages]`. Como `messages` muda a cada evento Realtime, **todos** os `MessageBubble` (e seus `AudioPlayer`) re-renderizam desnecessariamente, causando re-execução dos efeitos de descriptografia.

### 2. Efeito de descriptografia sem cancelamento (AudioPlayer e KanbanAudioPlayer)
Os `useEffect` de descriptografia em ambos os players não possuem flag de abort. Re-renders rápidos disparam múltiplas chamadas à API, e respostas fora de ordem podem sobrescrever o áudio correto com o de outra mensagem.

## Correções

### Arquivo 1: `src/pages/Conversations.tsx` (linhas 936-941)

Estabilizar `handleReply` usando `useRef` para evitar re-renders em cascata:

```typescript
// Adicionar ref antes do callback:
const messagesRef = useRef(messages);
messagesRef.current = messages;

const handleReply = useCallback((messageId: string) => {
  const message = messagesRef.current.find(m => m.id === messageId);
  if (message) {
    setReplyToMessage(message as any);
  }
}, []); // Sem dependência em messages
```

### Arquivo 2: `src/components/conversations/MessageBubble.tsx` (linhas 127-183)

Adicionar flag `cancelled` no useEffect de descriptografia:

```typescript
useEffect(() => {
  if (!needsDecryption) return;
  let cancelled = false;

  const loadAudio = async () => {
    // ... cache checks (sem mudança) ...
    const response = await supabase.functions.invoke(...);
    if (cancelled) return; // Ignorar se efeito foi limpo
    // ... resto da lógica ...
  };

  loadAudio();
  cleanupOldCache();
  return () => { cancelled = true; };
}, [needsDecryption, whatsappMessageId, conversationId, mimeType]);
```

### Arquivo 3: `src/components/kanban/KanbanChatPanel.tsx` (linhas 180-231)

Mesma correção de abort no KanbanAudioPlayer:

```typescript
useEffect(() => {
  if (!needsDecryption) return;
  let cancelled = false;

  const loadAudio = async () => {
    // ... cache checks ...
    const response = await supabase.functions.invoke(...);
    if (cancelled) return;
    // ... resto ...
  };

  loadAudio();
  cleanupOldCache();
  return () => { cancelled = true; };
}, [needsDecryption, whatsappMessageId, conversationId, mimeType]);
```

## Risco

**Zero**. As mudanças são aditivas e isoladas:
- A ref é um padrão React comum para estabilizar callbacks
- O abort apenas ignora resultados de chamadas já canceladas
- Nenhuma lógica existente é alterada
