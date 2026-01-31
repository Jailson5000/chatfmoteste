

# Remover Botões "Lista" e "Menção" do Editor

## Objetivo

Remover apenas os botões "Lista" e "Menção" da barra de ferramentas do editor de prompts, mantendo todo o resto funcionando normalmente.

---

## Alterações

### Arquivo: `src/components/ai-agents/MentionEditor.tsx`

| Linha | Alteração |
|-------|-----------|
| 4 | Remover `List` e `AtSign` das importações de lucide-react |
| 879-894 | Remover botão "Lista" (ícone List + Tooltip) |
| 896 | Remover separador vertical (`<div className="w-px h-5..."/>`) |
| 898-914 | Remover botão "Menção" (ícone AtSign + texto + Tooltip) |

### Importações (antes)
```tsx
import { Bold, Italic, List, HelpCircle, AtSign } from "lucide-react";
```

### Importações (depois)
```tsx
import { Bold, Italic, HelpCircle } from "lucide-react";
```

---

## O Que Permanece Inalterado

- ✅ Botão Negrito (B)
- ✅ Botão Itálico (I)  
- ✅ Botão Ajuda (?)
- ✅ Contador de caracteres
- ✅ Funcionalidade de menções via digitação de "@"
- ✅ Toda lógica de parsing e validação de menções
- ✅ Formatação e estilização das badges de menção

---

## Garantias

1. **Não há regressão**: Apenas remoção de elementos de UI
2. **Menções continuam funcionando**: Usuário digita "@" para abrir o picker
3. **Listas ainda podem ser criadas**: Manualmente pelo usuário digitando "- " ou "• "

