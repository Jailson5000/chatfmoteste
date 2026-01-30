

# Correção: Áudio Travado no "Carregando" + Análise de Velocidade de Envio

## Resumo do Problema

No Kanban, após enviar um áudio para o WhatsApp, a mensagem aparece no chat local com estado "Carregando áudio..." **indefinidamente**, mesmo que o áudio já tenha sido entregue ao destinatário no WhatsApp.

## Problemas Identificados

### Problema 1: AudioPlayer Não Verifica URLs Válidas (CRÍTICO)

**Localização:** `src/components/conversations/MessageBubble.tsx`, linhas 107-108

**Código Problemático:**
```typescript
// Para áudios do WhatsApp sempre forçar descriptografia para evitar problemas de URLs expiradas
const needsDecryption = !!whatsappMessageId && !!conversationId;
```

**Por que está errado:**
- O `AudioPlayer` tenta descriptografar **TODOS** os áudios que possuem `whatsappMessageId` e `conversationId`, independentemente de já ter uma URL válida
- Após envio, a `media_url` do áudio pode ser:
  1. Um **blob URL** (`blob:http://...`) - URL local temporária, não descriptografável
  2. Uma **URL pública do Supabase Storage** - não precisa descriptografar  
  3. Uma **URL da Evolution API** - URL real do WhatsApp, acessível diretamente
- Componentes como `ImageViewer`, `VideoPlayer` e `DocumentViewer` já possuem essa verificação:
  ```typescript
  const isPublicUrl = isPublicStorageUrl(src);
  const needsDecryption = !isPublicUrl && !!whatsappMessageId && !!conversationId;
  ```

### Problema 2: Blob URLs São Tratadas Como Precisando Descriptografia

Quando o frontend cria uma mensagem otimista com `media_url = blob:http://...`, o `AudioPlayer`:
1. Detecta `whatsappMessageId` e `conversationId` presentes
2. Define `needsDecryption = true`
3. Ignora o `src` (blob URL) e tenta chamar `get_media` na Evolution API
4. A Evolution API falha porque o áudio foi **enviado** por nós, não recebido
5. O componente fica em estado "isDecrypting" indefinidamente ou mostra erro

### Problema 3: Falta de Verificação de Blob URL

O `AudioPlayer` não verifica se o `src` é um blob URL válido antes de tentar descriptografar:
```typescript
// Falta verificação como:
const isBlobUrl = src?.startsWith('blob:');
```

## Análise de Velocidade de Envio

Verifiquei o `DELAY_CONFIG` em `supabase/functions/_shared/human-delay.ts`:

```typescript
export const DELAY_CONFIG = {
  MANUAL_SEND: { min: 0, max: 0 },        // Envios manuais - SEM delay ✓
  AI_RESPONSE: { min: 1000, max: 3000 },  // IA - 1-3s jitter ✓
  FOLLOW_UP: { min: 1500, max: 4000 },    // Follow-ups - 1.5-4s ✓
  PROMOTIONAL: { min: 5000, max: 10000 }, // Promocional - 5-10s ✓
  REMINDER: { min: 2000, max: 5000 },     // Lembretes - 2-5s ✓
  SPLIT_MESSAGE: { min: 800, max: 2000 }, // Partes de msg - 0.8-2s ✓
  AUDIO_CHUNK: { min: 500, max: 1000 },   // Chunks de áudio - 0.5-1s ✓
};
```

**Conclusão:** Os delays estão otimizados. Envios manuais têm delay ZERO, o que é correto. A velocidade está adequada.

## Correções Propostas

### Correção 1: Atualizar AudioPlayer com Verificação de URL Válida

```typescript
// ANTES (linha 107-108):
const needsDecryption = !!whatsappMessageId && !!conversationId;

// DEPOIS:
// Check if URL is already playable (blob URL, public URL, or data URL)
const isBlobUrl = src?.startsWith('blob:');
const isDataUrl = src?.startsWith('data:');
const isPublicUrl = isPublicStorageUrl(src || '');
const isDirectlyPlayable = isBlobUrl || isDataUrl || isPublicUrl || (src && !isEncryptedMedia(src));

// Only need decryption for WhatsApp encrypted media that isn't already playable
const needsDecryption = !isDirectlyPlayable && !!whatsappMessageId && !!conversationId;
```

### Correção 2: Adicionar Fallback para Blob URL Expirado

Se um blob URL falhar ao carregar (porque foi revogado), o componente deve tentar descriptografar:

```typescript
const [blobFailed, setBlobFailed] = useState(false);

// Na lógica de needsDecryption:
const needsDecryption = 
  (blobFailed && !!whatsappMessageId && !!conversationId) || 
  (!isDirectlyPlayable && !!whatsappMessageId && !!conversationId);

// No elemento <audio>:
onError={() => {
  if (isBlobUrl && !blobFailed) {
    setBlobFailed(true); // Tentar descriptografar como fallback
  } else {
    setError(true);
  }
}}
```

### Correção 3: Alinhar KanbanAudioPlayer com Mesma Lógica

O `KanbanAudioPlayer` em `KanbanChatPanel.tsx` também precisa da mesma correção (linha 161):

```typescript
// ANTES:
const needsDecryption = src && isEncryptedMedia(src) && whatsappMessageId && conversationId;

// DEPOIS:
const isBlobUrl = src?.startsWith('blob:');
const isDataUrl = src?.startsWith('data:');
const isPublicUrl = src && (src.includes('supabase.co/storage/v1/object/public/') || src.includes('.supabase.co/storage/v1/object/public/'));
const isDirectlyPlayable = isBlobUrl || isDataUrl || isPublicUrl;

// Only try to decrypt encrypted WhatsApp media that isn't already playable
const needsDecryption = !isDirectlyPlayable && src && isEncryptedMedia(src) && whatsappMessageId && conversationId;
```

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/conversations/MessageBubble.tsx` | Atualizar `AudioPlayer` com verificação de URLs válidas |
| `src/components/kanban/KanbanChatPanel.tsx` | Atualizar `KanbanAudioPlayer` com mesma lógica |

---

## Detalhes Técnicos

### Fluxo Atual (Problemático)

```text
1. Usuário clica em gravar áudio
2. Frontend grava e cria blob URL
3. Mensagem otimista: { media_url: "blob:http://...", status: "sending" }
4. API chamada, áudio enviado para WhatsApp
5. Backend atualiza: { whatsapp_message_id: "ABC123", status: "sent" }
6. Realtime notifica frontend
7. AudioPlayer recebe: whatsappMessageId="ABC123", src="blob:http://..."
8. AudioPlayer: needsDecryption = true (ERRO!)
9. Tenta chamar get_media → Falha
10. Fica em "Carregando áudio..." indefinidamente
```

### Fluxo Corrigido

```text
1-6. (igual)
7. AudioPlayer recebe: whatsappMessageId="ABC123", src="blob:http://..."
8. AudioPlayer verifica: src é blob URL → isDirectlyPlayable = true
9. AudioPlayer: needsDecryption = false
10. Usa blob URL diretamente → Áudio toca normalmente
11. Se blob expirar → onError detecta → setBlobFailed(true)
12. Agora needsDecryption = true → Tenta get_media como fallback
```

## Checklist de Validação

- [ ] Enviar áudio no Kanban → Deve aparecer imediatamente como player funcional
- [ ] Áudio deve tocar usando blob URL local
- [ ] Se atualizar página → Áudio deve descriptografar via get_media
- [ ] Áudios recebidos de clientes → Devem descriptografar normalmente
- [ ] Velocidade de envio manual → Deve ser instantânea (sem delay artificial)

