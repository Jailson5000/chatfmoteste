
# Plano: Corrigir Exibição de Imagens Internas e Melhorar Velocidade

## Problemas Identificados

### Problema 1: Imagens Internas Não Funcionam ❌
**Causa raiz identificada na linha 940 do `ImageViewer`:**

```typescript
const imageSrc = needsDecryption ? decryptedSrc : src;
```

Esta lógica está errada para arquivos internos:
- Para arquivos internos: `needsDecryption = false` (correto)
- Então `imageSrc = src` (que é `internal-chat-files://...` - URL inválida!)
- O `decryptedSrc` É preenchido pelo useEffect mas **nunca é usado**!

### Problema 2: Duplicação ✅
Já foi corrigido na última alteração e você confirmou que não duplica mais.

### Problema 3: Demora para Aparecer
O fluxo atual é:
1. Usuário envia arquivo interno
2. Upload para storage (~500ms)
3. Insert no banco de dados
4. Realtime detecta INSERT (debounce 100ms)
5. Mensagem aparece no chat

**Solução:** Adicionar UI otimista - mostrar mensagem com loading imediatamente.

---

## Correções a Implementar

### Correção 1: Exibição de Imagens Internas

**Arquivo:** `src/components/conversations/MessageBubble.tsx`
**Linhas:** 940 e 974

Alterar a lógica de `imageSrc` para considerar também `isInternalFile`:

```typescript
// ANTES (linha 940):
const imageSrc = needsDecryption ? decryptedSrc : src;

// DEPOIS:
// Use decryptedSrc for both WhatsApp decryption AND internal files (signed URLs)
const imageSrc = (needsDecryption || isInternalFile) ? decryptedSrc : src;
```

E ajustar a condição de erro (linha 974):

```typescript
// ANTES:
if (error || (!imageSrc && needsDecryption)) {

// DEPOIS:
// Show error if: explicit error, or waiting for signed URL/decryption but none provided
if (error || (!imageSrc && (needsDecryption || isInternalFile))) {
```

### Correção 2: Velocidade de Exibição (UI Otimista)

**Arquivo:** `src/pages/Conversations.tsx`
**Função:** `handleInternalFileUpload`

Adicionar mensagem otimista com preview local antes do upload:

```typescript
const handleInternalFileUpload = async (file: File) => {
  // 1. Criar preview local (URL temporária)
  const localPreviewUrl = URL.createObjectURL(file);
  const tempId = crypto.randomUUID();
  
  // 2. Adicionar mensagem otimista IMEDIATAMENTE
  const optimisticMessage = {
    id: tempId,
    content: isImage ? "" : `📎 ${file.name}`,
    message_type: isImage ? "image" : "document",
    media_url: localPreviewUrl, // Preview local (blob URL)
    media_mime_type: file.type,
    is_from_me: true,
    sender_type: "human",
    is_internal: true,
    created_at: new Date().toISOString(),
    status: "sending",
    _clientTempId: tempId,
  };
  
  setMessages(prev => [...prev, optimisticMessage]);
  
  // 3. Fazer upload e insert (em background)
  // ... resto da lógica
  
  // 4. Quando INSERT completar, Realtime vai reconciliar
  // O merge vai preservar o _clientTempId para evitar duplicação
};
```

---

## Fluxo Após Correções

```text
Usuário envia imagem interna
         │
         v  (IMEDIATO - ~10ms)
┌─────────────────────────────┐
│ Mensagem otimista aparece   │
│ com preview local (blob:)   │
│ Status: "Enviando..."       │
└─────────────────────────────┘
         │
         v  (Background - 500ms)
┌─────────────────────────────┐
│ Upload para storage         │
│ Insert no banco             │
└─────────────────────────────┘
         │
         v  (Realtime - 100ms)
┌─────────────────────────────┐
│ Merge: substitui blob URL   │
│ pelo internal-chat-files:// │
│ Status: "Enviado" ✓         │
└─────────────────────────────┘
         │
         v
┌─────────────────────────────┐
│ ImageViewer detecta         │
│ internal-chat-files://      │
│ → Gera signed URL           │
│ → Exibe imagem real         │
└─────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/conversations/MessageBubble.tsx` | Corrigir lógica de `imageSrc` para usar `decryptedSrc` quando `isInternalFile = true` (linhas 940, 974) |
| `src/pages/Conversations.tsx` | Adicionar UI otimista em `handleInternalFileUpload` para exibir mensagem imediatamente com preview local |

---

## Segurança

- ✅ Sem alteração em RLS
- ✅ Bucket continua privado
- ✅ Signed URLs com expiração de 5 minutos
- ✅ Não afeta canais WhatsApp (fluxo separado)
- ✅ Não afeta documentos internos (já funcionam)

---

## Resultado Esperado

1. **Imagens internas exibem corretamente** ✓
2. **Mensagem aparece instantaneamente** (preview local)
3. **Sem duplicação** (reconciliação por `_clientTempId`)
4. **Transição suave** de preview → imagem real
