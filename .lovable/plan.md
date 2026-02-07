

# Plano: Unificar Cor do Badge "Via Anúncio"

## Problema Identificado

O badge "Via Anúncio" está com cores diferentes em cada componente:

| Componente | Cor Atual | Arquivo |
|------------|-----------|---------|
| **ConversationSidebarCard** | Azul (`bg-blue-100 text-blue-700`) ✅ | `src/components/conversations/ConversationSidebarCard.tsx` |
| **KanbanCard** | Verde (`bg-green-100 text-green-700`) ❌ | `src/components/kanban/KanbanCard.tsx` |

---

## Solução

Alterar a cor do badge no **KanbanCard.tsx** para usar o azul escuro, igual ao ConversationSidebarCard.

---

## Alteração Necessária

**Arquivo:** `src/components/kanban/KanbanCard.tsx`

**Linha 281** - Alterar de:
```tsx
className="text-[10px] h-4 px-1.5 border-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
```

**Para:**
```tsx
className="text-[10px] h-4 px-1.5 border-0 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
```

---

## Resultado Visual

```text
┌──────────────────────────────────────────────────────────────────────┐
│  ANTES                        │  DEPOIS                              │
├───────────────────────────────┼──────────────────────────────────────┤
│  Kanban: 🟢 Via Anúncio       │  Kanban: 🔵 Via Anúncio              │
│  (verde claro)                │  (azul escuro)                       │
│                               │                                      │
│  Conversas: 🔵 Via Anúncio    │  Conversas: 🔵 Via Anúncio           │
│  (azul escuro)                │  (azul escuro)                       │
└───────────────────────────────┴──────────────────────────────────────┘
                                     ✅ Ambos iguais!
```

---

## Impacto

| Aspecto | Avaliação |
|---------|-----------|
| Risco | **NENHUM** - Apenas mudança de cor em classe CSS |
| Arquivos alterados | 1 arquivo |
| Tempo de implementação | ~10 segundos |

