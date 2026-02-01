
# Plano: Corrigir Corte do Focus Ring à Esquerda

## Problema Identificado

Os elementos focados (Status, Categoria, Descrição, Comentários) exibem um contorno vermelho (focus ring) que está sendo cortado no lado esquerdo devido ao padding insuficiente no container.

## Causa Raiz

Na última alteração, mudamos o padding de `pr-4` para `px-1`:

```typescript
<ScrollArea className="h-[calc(100vh-200px)] mt-4 px-1">
  <div className="space-y-4 pr-3">
```

O `px-1` (4px cada lado) é muito pequeno para acomodar o outline/ring que tipicamente tem 2px de largura + 2px de offset, totalizando ~4px mínimo necessário.

## Solução

Aumentar o padding à esquerda para `px-2` (8px cada lado) para garantir espaço suficiente:

| Propriedade | Antes | Depois |
|-------------|-------|--------|
| ScrollArea padding | `px-1` | `px-2` |

```typescript
<ScrollArea className="h-[calc(100vh-200px)] mt-4 px-2">
  <div className="space-y-4 pr-2">
```

## Arquivo a Modificar

| Arquivo | Linha | Alteração |
|---------|-------|-----------|
| `TaskDetailSheet.tsx` | 237 | `px-1` → `px-2` |
| `TaskDetailSheet.tsx` | 238 | `pr-3` → `pr-2` (manter proporção) |

## Resultado Esperado

- Focus ring visível por completo em todos os lados
- Layout equilibrado sem cortes visuais
- Mantém todas as funcionalidades já corrigidas (datas, alertas, optimistic updates)
