
# Plano: Corrigir Chat Interno (Imagens e Duplicação)

## Problemas Identificados

### Problema 1: Imagens não funcionam
Quando o usuário envia uma imagem no modo interno:
- A imagem é salva com `message_type: "document"` em vez de `"image"`
- O `ImageViewer` não suporta o protocolo `internal-chat-files://`
- Resultado: mostra "Imagem não disponível" ❌

### Problema 2: Arquivos duplicados
Quando o usuário envia um arquivo interno:
1. O código insere no banco de dados
2. O código adiciona ao state local com ID diferente
3. O Realtime detecta o INSERT e tenta adicionar novamente
4. A deduplicação falha porque os IDs são diferentes
- Resultado: arquivo aparece 2 vezes até dar F5 ❌

---

## Solução Proposta

### Correção 1: Suporte a Imagens Internas

Modificar o `handleInternalFileUpload` para detectar o tipo correto de mídia:

```text
Se arquivo é imagem → message_type = "image"
Se arquivo é documento → message_type = "document"
```

Modificar o `ImageViewer` para suportar arquivos internos (signed URLs):

```text
Se src começa com "internal-chat-files://"
  → Gerar signed URL do storage privado
  → Exibir imagem normalmente
```

### Correção 2: Eliminar Duplicação

Remover a adição manual ao state local e deixar o Realtime cuidar disso:

**Antes:**
```typescript
// Insert no banco
const { error } = await supabase.from("messages").insert({...});

// ❌ PROBLEMA: Adiciona manualmente ao state
setMessages(prev => [...prev, newMessage]);
```

**Depois:**
```typescript
// Insert no banco
const { error } = await supabase.from("messages").insert({...});

// ✅ NÃO adicionar ao state - Realtime vai cuidar disso
// Mensagem aparece via subscription de INSERT
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Conversations.tsx` | 1. Detectar tipo de mídia (image/document) na função `handleInternalFileUpload`<br>2. Remover `setMessages(prev => [...prev, newMessage])` para evitar duplicação |
| `src/components/conversations/MessageBubble.tsx` | Adicionar suporte a `internal-chat-files://` no `ImageViewer` |

---

## Detalhes Técnicos

### Arquivo: `src/pages/Conversations.tsx`
**Linhas 1462-1527 - `handleInternalFileUpload`**

```typescript
// ANTES (linha 1489-1490):
message_type: "document",

// DEPOIS:
// Detectar se é imagem
const isImage = file.type.startsWith('image/');
const messageType = isImage ? "image" : "document";
// ...
message_type: messageType,
```

**Remover linhas 1501-1516** (adição manual ao state):
```typescript
// REMOVER ESTE BLOCO:
const newMessage: Message = {...};
setMessages(prev => [...prev, newMessage]);
```

### Arquivo: `src/components/conversations/MessageBubble.tsx`
**Linhas 816-962 - `ImageViewer`**

Adicionar lógica para arquivos internos:

```typescript
// Verificar se é arquivo interno
const isInternalFile = src.startsWith('internal-chat-files://');

// Se for interno, gerar signed URL
useEffect(() => {
  if (!isInternalFile) return;
  
  const loadInternalImage = async () => {
    const filePath = src.replace('internal-chat-files://', '');
    const { data, error } = await supabase.storage
      .from('internal-chat-files')
      .createSignedUrl(filePath, 60);
    
    if (data?.signedUrl) {
      setDecryptedSrc(data.signedUrl);
    } else {
      setError(true);
    }
  };
  
  loadInternalImage();
}, [src, isInternalFile]);
```

---

## Fluxo Corrigido

```text
Usuário envia arquivo interno
         │
         v
┌─────────────────────────────┐
│ handleInternalFileUpload    │
│ 1. Upload para storage      │
│ 2. Detecta tipo (image/doc) │
│ 3. Insert no banco          │
│ 4. NÃO adiciona ao state ✓  │
└─────────────────────────────┘
         │
         v
┌─────────────────────────────┐
│ Realtime Subscription       │
│ Detecta INSERT              │
│ Adiciona ao state (único)   │
└─────────────────────────────┘
         │
         v
┌─────────────────────────────┐
│ MessageBubble renderiza     │
│ - Se imagem → ImageViewer   │
│   → Gera signed URL         │
│   → Exibe imagem ✓          │
│ - Se documento → DocViewer  │
│   (já funciona)             │
└─────────────────────────────┘
```

---

## Segurança

- ✅ Sem alteração em RLS
- ✅ Arquivos continuam no bucket privado
- ✅ Signed URLs expiram em 60 segundos
- ✅ Sem risco de regressão em canais WhatsApp
- ✅ Mantém compatibilidade com arquivos existentes

---

## Resultado Esperado

1. **Imagens internas**: Exibem corretamente no chat ✓
2. **Arquivos internos**: Aparecem apenas 1 vez ✓
3. **Canais WhatsApp**: Não afetados (fluxo separado) ✓
4. **Documentos internos**: Continuam funcionando (já OK) ✓
