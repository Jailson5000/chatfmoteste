
# Plano: Ajustar Layout do Painel de Detalhes da Tarefa

## Problemas Identificados

Analisando a captura de tela:

1. **Lado esquerdo cortado**: O conteúdo parece estar encostando na borda esquerda do Sheet
2. **Botão Excluir muito baixo**: A altura da ScrollArea é muito grande, empurrando o botão para fora da tela

## Causa Raiz

| Problema | Causa no Código |
|----------|-----------------|
| Corte à esquerda | `ScrollArea` com `pr-4` mas sem padding à esquerda equivalente |
| Botão muito baixo | `ScrollArea` com `h-[calc(100vh-180px)]` muito generosa |

---

## Correções Propostas

### 1. Ajustar Padding da ScrollArea

Linha 237:
```typescript
// Antes
<ScrollArea className="h-[calc(100vh-180px)] mt-4 pr-4">

// Depois - Adicionar padding uniforme e reduzir altura
<ScrollArea className="h-[calc(100vh-200px)] mt-4 px-1">
```

### 2. Ajustar Espaçamento Interno

Alterar o espaçamento do container interno (linha 238):
```typescript
// Antes
<div className="space-y-6">

// Depois - Reduzir espaçamento vertical para compactar
<div className="space-y-4 pr-3">
```

### 3. Reduzir Altura Mínima da Descrição

A descrição tem `min-h-[80px]` que ocupa espaço desnecessário (linha 397):
```typescript
// Antes
"p-3 rounded-md border cursor-pointer transition-colors hover:bg-muted/50 group min-h-[80px]"

// Depois - Reduzir altura mínima
"p-3 rounded-md border cursor-pointer transition-colors hover:bg-muted/50 group min-h-[60px]"
```

---

## Resumo das Alterações

| Arquivo | Linha | Alteração |
|---------|-------|-----------|
| `TaskDetailSheet.tsx` | 237 | `h-[calc(100vh-180px)] mt-4 pr-4` → `h-[calc(100vh-200px)] mt-4 px-1` |
| `TaskDetailSheet.tsx` | 238 | `space-y-6` → `space-y-4 pr-3` |
| `TaskDetailSheet.tsx` | 397 | `min-h-[80px]` → `min-h-[60px]` |

---

## Resultado Esperado

1. Conteúdo com padding uniforme (não corta à esquerda)
2. Botão "Excluir Tarefa" visível mais acima na tela
3. Layout mais compacto e equilibrado
4. Nenhuma quebra nas funcionalidades já corrigidas (datas, alertas, optimistic updates)

---

## Segurança

- Alterações apenas de CSS/layout
- Sem mudanças de lógica ou funcionalidade
- Isolado ao componente `TaskDetailSheet`
