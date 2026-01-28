
## Melhorias Visuais no Player de Áudio

### Resumo das Alterações

**Duas modificações simples no componente `MessageBubble.tsx`:**

1. **Remover o placeholder "[ÁUDIO]"** que aparece para áudios sem URL/whatsappMessageId
2. **Alterar o texto de loading** baseado na direção da mensagem:
   - Enviados (`isFromMe: true`): "Enviando áudio..."
   - Recebidos (`isFromMe: false`): "Baixando áudio..."

---

### Detalhes Técnicos

#### Arquivo: `src/components/conversations/MessageBubble.tsx`

**Alteração 1 - Linha 335: Mudar texto de descriptografia**

De:
```tsx
<span className="text-xs text-primary/70 font-medium">Descriptografando áudio...</span>
```

Para:
```tsx
<span className="text-xs text-primary/70 font-medium">
  {isFromMe ? "Enviando áudio..." : "Baixando áudio..."}
</span>
```

**Alteração 2 - Linhas 1786-1796: Simplificar placeholder de áudio**

De:
```tsx
{!hasMedia && messageType === "audio" && !whatsappMessageId && (
  <div className="flex items-center gap-2 p-2 rounded-lg bg-primary-foreground/10">
    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-primary/20">
      <Mic className="h-5 w-5 text-primary" />
    </div>
    <div className="flex-1">
      <p className="text-sm font-medium">Mensagem de áudio</p>
      <p className="text-xs text-muted-foreground">Áudio enviado via WhatsApp</p>
    </div>
  </div>
)}
```

Para:
```tsx
{!hasMedia && messageType === "audio" && !whatsappMessageId && (
  <div className="flex items-center gap-2 p-2 rounded-lg bg-primary-foreground/10">
    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-primary/20">
      <Mic className="h-5 w-5 text-primary" />
    </div>
    <div className="flex-1">
      <div className="flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">
          {isFromMe ? "Enviando..." : "Baixando..."}
        </span>
      </div>
    </div>
  </div>
)}
```

---

### Resultado Visual

| Situação | Antes | Depois |
|----------|-------|--------|
| Áudio enviado carregando | "Descriptografando áudio..." | "Enviando áudio..." |
| Áudio recebido carregando | "Descriptografando áudio..." | "Baixando áudio..." |
| Placeholder sem URL (enviado) | "[ÁUDIO] Mensagem de áudio - Áudio enviado via WhatsApp" | Spinner + "Enviando..." |
| Placeholder sem URL (recebido) | "[ÁUDIO] Mensagem de áudio - Áudio enviado via WhatsApp" | Spinner + "Baixando..." |

### Risco

- **Zero risco de regressão**: Alterações são apenas de texto/UI
- Não afeta lógica de envio, recebimento ou descriptografia de áudio
- Mantém todos os estilos e comportamentos existentes
