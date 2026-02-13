

# Renderizar templates como cards visuais no chat

## Problema atual

Na screenshot, as mensagens antigas salvas como `[template: hello_world]` aparecem como texto cru. A ultima mensagem (20:31) ja mostra o conteudo real porque foi enviada apos o fix anterior. Mas o visual ainda e texto simples sem destaque.

## O que vou fazer

### 1. MessageBubble.tsx - Card visual para templates

Substituir a renderizacao simples de emoji+texto por um card estilizado quando o conteudo e um template:

- Se o conteudo comecar com `[template: X]`, renderizar um card com icone FileText, nome do template e badge "Template"
- Se o conteudo tiver o formato do template expandido (Header + Body + Footer + Botoes), renderizar com separadores visuais e botoes estilizados

O card tera:
- Borda lateral verde (estilo WhatsApp)
- Icone de template no topo
- Secoes visuais para Header, Body, Footer
- Botoes renderizados como chips clicaveis (estilo WhatsApp)

### 2. Detectar e parsear conteudo de template expandido

Templates ja expandidos (como o da mensagem das 20:31) contem patterns como:
- Linhas com `[Opcoes: X | Y]` no final
- Texto com `_footer_` em italico

Vou detectar esses patterns e renderizar com o mesmo card visual.

### Alteracoes tecnicas

**`src/components/conversations/MessageBubble.tsx`**:

Linhas 1863-1867: Substituir a renderizacao simples por deteccao de template e flag:

```typescript
// Detect template messages
const isTemplateMessage = normalized.startsWith('[template:') || 
  normalized.match(/^\[template:\s*(.+)\]$/i);
const templateName = normalized.match(/^\[template:\s*(.+)\]$/i)?.[1];

// For [template: X] show nothing in text - will render as card below
if (templateName && !normalized.includes('\n')) return ""; 
```

Linhas 2040-2044: Antes do bloco de texto, adicionar renderizacao de card de template:

```typescript
{/* Template message card */}
{isTemplateCard && (
  <div className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950/30 rounded-r-lg p-3 space-y-1">
    <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
      <FileText className="h-3.5 w-3.5" />
      Template: {templateName}
    </div>
  </div>
)}
```

Para templates com conteudo expandido (Body, Footer, Botoes), parsear as secoes e renderizar cada uma:
- `[Opcoes: X | Y]` vira botoes visuais
- `_texto_` vira italico (footer)
- Resto e body normal

### Resumo

| Arquivo | Alteracao |
|---------|-----------|
| `MessageBubble.tsx` | Card visual estilizado para `[template: X]` e deteccao de botoes/footer em templates expandidos |

Nenhuma alteracao no backend - o conteudo ja esta sendo salvo corretamente.
