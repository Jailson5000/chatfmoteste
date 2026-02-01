
# Plano: Corrigir Corte do Focus Ring no ScrollArea

## Problema Identificado

Analisando a estrutura:

1. O `ScrollArea` usa `overflow-hidden` no Root (linha 18 do scroll-area.tsx)
2. Mesmo com `px-2` no Root, o overflow corta qualquer elemento que ultrapasse os limites
3. O focus ring (outline/ring) externo aos inputs é cortado porque está fora do espaço de padding

## Estrutura Atual

```
ScrollArea (Root) → overflow-hidden + px-2 ← padding aqui não ajuda!
  └── Viewport → aqui está o conteúdo
       └── div.space-y-4 → elementos com focus ring
```

O problema é que o `px-2` está no **Root** que tem `overflow-hidden`, mas o padding precisa estar **dentro do Viewport** para criar espaço visual.

## Solução

Mover o padding do ScrollArea para o container interno:

| Elemento | Antes | Depois |
|----------|-------|--------|
| ScrollArea | `px-2` | (remover) |
| div interno | `pr-2` | `px-3` (padding uniforme) |

```typescript
// Antes
<ScrollArea className="h-[calc(100vh-200px)] mt-4 px-2">
  <div className="space-y-4 pr-2">

// Depois  
<ScrollArea className="h-[calc(100vh-200px)] mt-4">
  <div className="space-y-4 px-3">
```

O padding `px-3` dentro do Viewport cria 12px de espaço em cada lado, suficiente para o focus ring (2px + 2px offset ≈ 4px).

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/tasks/TaskDetailSheet.tsx` | Linha 237: remover `px-2` |
| `src/components/tasks/TaskDetailSheet.tsx` | Linha 238: `pr-2` → `px-3` |

## Resultado Esperado

- Focus ring visível por completo em todos os lados
- O padding está **dentro** da área scrollável
- Mantém todas as funcionalidades já corrigidas
