
# Plano: Corrigir Exibição de Contatos WABA e Adicionar Suporte a Figurinhas (Stickers)

## Problemas Identificados

### Problema 1: Contatos da API do WhatsApp Business (WABA) não mostram nome
**Análise técnica:**
- Mensagens vindas de números usando WABA às vezes não incluem o campo `pushName` no payload
- O webhook Evolution API (`evolution-webhook/index.ts`, linha 3755) usa APENAS `data.pushName` para definir o nome do contato
- Quando `pushName` está ausente, o sistema usa apenas o número de telefone como nome
- WABA pode enviar o nome em campos alternativos que não estamos capturando

**Código atual (linha 3755):**
```typescript
const contactName = (!isFromMe && data.pushName) ? data.pushName : phoneNumber;
```

### Problema 2: Figurinhas aparecem como "📎 Mídia" ao invés da imagem
**Análise técnica:**
- A interface `stickerMessage` está definida na linha 750-754, mas **NÃO há código para processar stickers**
- O bloco de extração de conteúdo (linhas 3996-4139) trata: `conversation`, `extendedTextMessage`, `imageMessage`, `audioMessage`, `videoMessage`, `documentMessage`
- **NÃO existe tratamento para `stickerMessage`** - stickers são ignorados completamente
- O frontend (`MessageBubble.tsx`) também não tem lógica para renderizar stickers como imagens

---

## Solução Proposta

### Parte 1: Suporte a Nomes de Contatos WABA

Expandir a lógica de extração de nome para buscar em campos alternativos que a Evolution API pode fornecer para mensagens WABA:

```typescript
// Extrair nome do contato de múltiplas fontes possíveis
// WABA pode não enviar pushName, mas pode ter outros campos
const getContactName = (data: MessageData, isFromMe: boolean, phoneNumber: string): string => {
  // Não usar pushName para mensagens enviadas por nós
  if (isFromMe) return phoneNumber;
  
  // Prioridade de fontes de nome:
  // 1. pushName (WhatsApp pessoal)
  // 2. notify (alguns payloads WABA)
  // 3. verifiedName (WABA verificado)
  // 4. formattedName (alguns casos WABA)
  // 5. Fallback para número de telefone
  return data.pushName || 
         (data as any).notify || 
         (data as any).verifiedName || 
         (data as any).formattedName ||
         (data as any).sender?.pushName ||
         (data as any).sender?.name ||
         phoneNumber;
};
```

**Atualização da interface MessageData** para incluir campos WABA:
```typescript
interface MessageData {
  key: { remoteJid: string; fromMe: boolean; id: string };
  pushName?: string;
  // Campos alternativos para WABA
  notify?: string;
  verifiedName?: string;
  formattedName?: string;
  sender?: {
    pushName?: string;
    name?: string;
  };
  // ... resto
}
```

### Parte 2: Suporte Completo a Figurinhas (Stickers)

#### 2.1. Backend: Processar `stickerMessage` no Webhook

Adicionar tratamento de stickers no bloco de extração de mensagens (após linha 4139):

```typescript
// Adicionar após } else if (data.message?.documentMessage) { ... }
} else if (data.message?.stickerMessage) {
  messageType = 'sticker';
  messageContent = ''; // Stickers não têm texto
  mediaUrl = data.message.stickerMessage.url || '';
  mediaMimeType = data.message.stickerMessage.mimetype || 'image/webp';
}
```

#### 2.2. Frontend: Renderizar Stickers como Imagens

**MessageBubble.tsx** - Adicionar suporte a stickers no `renderMedia()`:

```typescript
// Adicionar sticker às verificações de media type
const isSticker = messageType === "sticker" || mediaMimeType === "image/webp";

// No canFetchWithoutUrl, incluir sticker
const canFetchWithoutUrl = !mediaUrl && !!whatsappMessageId && !!conversationId &&
  (messageType === "image" || messageType === "document" || 
   messageType === "audio" || messageType === "video" || 
   messageType === "ptt" || messageType === "sticker");

// No renderMedia(), adicionar após verificação de isImage:
if ((isSticker || mediaMimeType === "image/webp") && (mediaUrl || canFetchWithoutUrl)) {
  return (
    <StickerViewer
      src={srcForMedia}
      mimeType={mediaMimeType || "image/webp"}
      whatsappMessageId={whatsappMessageId || undefined}
      conversationId={conversationId}
    />
  );
}
```

#### 2.3. Criar Componente StickerViewer

Componente específico para stickers (tamanho menor, sem clique para expandir):

```typescript
function StickerViewer({ src, mimeType, whatsappMessageId, conversationId }: {
  src: string;
  mimeType?: string;
  whatsappMessageId?: string;
  conversationId?: string;
}) {
  // Lógica similar ao ImageViewer, mas:
  // - Tamanho máximo menor (160x160px típico de sticker)
  // - Sem modal de expansão
  // - Fundo transparente preservado (WebP com alpha)
  
  return (
    <div className="max-w-[160px] max-h-[160px]">
      <img
        src={decryptedSrc || src}
        alt="Figurinha"
        className="max-w-full max-h-[160px] object-contain"
      />
    </div>
  );
}
```

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `supabase/functions/evolution-webhook/index.ts` | 1. Expandir `MessageData` com campos WABA 2. Criar função `getContactName()` 3. Adicionar processamento de `stickerMessage` |
| `src/components/conversations/MessageBubble.tsx` | 1. Criar componente `StickerViewer` 2. Adicionar `sticker` ao `canFetchWithoutUrl` 3. Renderizar stickers no `renderMedia()` |
| `src/pages/Conversations.tsx` | Já tem suporte a "sticker" no preview (linha 988-989) - OK |

---

## Detalhes Técnicos

### Fluxo de Processamento de Sticker

```
┌─────────────────────────┐
│ WhatsApp envia sticker  │
│ (message.stickerMessage)│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│ evolution-webhook/index.ts:                     │
│                                                 │
│ } else if (data.message?.stickerMessage) {     │
│   messageType = 'sticker';                      │
│   mediaUrl = data.message.stickerMessage.url;   │
│   mediaMimeType = 'image/webp';                 │
│ }                                               │
└───────────┬─────────────────────────────────────┘
            │ Salva no DB com message_type='sticker'
            ▼
┌─────────────────────────────────────────────────┐
│ MessageBubble.tsx:                              │
│                                                 │
│ if (messageType === 'sticker') {               │
│   return <StickerViewer ... />                 │
│ }                                               │
└───────────┬─────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│ StickerViewer:                                  │
│ - Decrypt via evolution-api (se necessário)    │
│ - Renderiza como imagem WebP (160x160 max)     │
│ - Preserva transparência                        │
└─────────────────────────────────────────────────┘
```

### Extração de Nome de Contato WABA

```
┌─────────────────────────┐
│ Mensagem WABA recebida  │
│ (sem pushName)          │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│ getContactName(data):                           │
│                                                 │
│ 1. data.pushName       → ❌ undefined           │
│ 2. data.notify         → ✅ "João Silva"        │
│ 3. data.verifiedName   → (não chega aqui)      │
│ 4. phoneNumber         → (fallback)             │
│                                                 │
│ return "João Silva"                             │
└───────────┬─────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│ Conversa criada/atualizada com:                │
│ contact_name = "João Silva" (não mais número)  │
└─────────────────────────────────────────────────┘
```

---

## Prevenção de Regressões

1. **Mantém lógica existente intacta** - Apenas adiciona novos casos, não modifica os existentes
2. **Fallback seguro** - Se nenhum nome alternativo existir, continua usando o número de telefone
3. **Compatibilidade retroativa** - Stickers antigos no banco de dados serão exibidos como "📎 Mídia" até reprocessamento
4. **Teste de tipos de mídia** - Não afeta processamento de image/audio/video/document existentes

---

## Benefícios

1. **Contatos WABA com nome**: Usuários verão nomes reais ao invés de apenas números
2. **Figurinhas visíveis**: Stickers aparecem como imagens, igual ao WhatsApp
3. **UX consistente**: Experiência de chat mais próxima do WhatsApp nativo
4. **Sem quebras**: Funcionalidade existente permanece inalterada
