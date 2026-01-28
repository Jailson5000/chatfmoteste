

## Remoção do Label "[Áudio]" da Visualização do Cliente

### Problema Identificado

Na screenshot, o cliente vê **"[Áudio]"** abaixo do player de áudio nas mensagens enviadas. Isso acontece porque:

1. **Quando áudio é enviado**, o sistema salva `content: "[Áudio]"` no banco de dados
2. **O MessageBubble** já tem filtros para remover alguns padrões de placeholder, mas o padrão exato `[Áudio]` não está sendo filtrado

### Origem do Texto "[Áudio]"

| Arquivo | Linha | Código |
|---------|-------|--------|
| `Conversations.tsx` | 1907 | `content: mediaType === "audio" ? "[Áudio]" : ...` |
| `evolution-api/index.ts` | 2427 | `content: "[Áudio]"` |

### Solução

**Arquivo:** `src/components/conversations/MessageBubble.tsx`

Adicionar um regex no `displayContent` para filtrar `[Áudio]` (e variações):

**Linha ~1560-1562 (no processamento de `displayContent`):**

De:
```typescript
let processed = content
  .replace(/\[\s*mensagem de [áa]udio\s*\]/gi, "")
  .replace(/\r\n/g, "\n");
```

Para:
```typescript
let processed = content
  .replace(/\[\s*mensagem de [áa]udio\s*\]/gi, "")
  .replace(/\[\s*[áaÁA]udio\s*\]/gi, "")  // Remove [Áudio], [Audio], [áudio], etc.
  .replace(/\r\n/g, "\n");
```

O novo regex `/\[\s*[áaÁA]udio\s*\]/gi` captura:
- `[Áudio]` ✅
- `[Audio]` ✅
- `[áudio]` ✅
- `[audio]` ✅
- `[ Áudio ]` ✅ (com espaços)

### Resultado Visual

| Antes | Depois |
|-------|--------|
| Player de áudio + "[Áudio]" abaixo | Apenas o player de áudio (igual ao WhatsApp) |

### Risco

- **Zero**: Alteração é apenas visual/cosmética
- Não afeta o armazenamento no banco
- Não afeta a reprodução do áudio
- Mantém a lógica de envio/recebimento intacta

