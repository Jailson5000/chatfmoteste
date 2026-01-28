
# Correção: Remover pointer-events-none que Causa Tela Preta

## Problema Identificado

O `pointer-events-none` aplicado ao texto e bolinha colorida está fazendo com que os cliques "vazem" para a camada de dismiss do Dialog, que interpreta como "clique fora" e fecha o modal abruptamente (tela preta).

**Por que funciona em Settings.tsx (edição de membros)?**
O código de edição **não usa** `pointer-events-none` nos elementos de texto e bolinha - os cliques são naturalmente capturados pelo div pai.

## Solução

Remover `pointer-events-none` do texto e da bolinha colorida no InviteMemberDialog, alinhando com o código que funciona em Settings.tsx.

## Arquivo Afetado

| Arquivo | Alteração |
|---------|-----------|
| `src/components/admin/InviteMemberDialog.tsx` | Remover `pointer-events-none` das linhas 231 e 234 |

## Mudanças Específicas

### InviteMemberDialog.tsx (linhas 230-234)

**ANTES:**
```tsx
<div
  className="w-3 h-3 rounded-full pointer-events-none"
  style={{ backgroundColor: dept.color }}
/>
<span className="text-sm pointer-events-none">{dept.name}</span>
```

**DEPOIS:**
```tsx
<div
  className="w-3 h-3 rounded-full"
  style={{ backgroundColor: dept.color }}
/>
<span className="text-sm">{dept.name}</span>
```

## Por que isso resolve

1. **Sem `pointer-events-none`**, os cliques no texto e na bolinha são capturados normalmente pelo DOM
2. O evento "borbulha" (bubble) para o div pai que tem o `onClick` com `handleDepartmentToggle`
3. O `stopPropagation()` no div pai impede que o clique chegue ao Dialog
4. O Dialog não interpreta como "clique fora"
5. A tela não fica preta

## Comparação Visual

```text
ANTES (com pointer-events-none):
┌─────────────────────────────────────┐
│ [checkbox] [●] Atendimento          │
│                 ↓                   │
│         Clique no texto             │
│                 ↓                   │
│   pointer-events-none (ignora)      │
│                 ↓                   │
│   Clique "vaza" para Dialog Layer   │
│                 ↓                   │
│   Dialog fecha = TELA PRETA         │
└─────────────────────────────────────┘

DEPOIS (sem pointer-events-none):
┌─────────────────────────────────────┐
│ [checkbox] [●] Atendimento          │
│                 ↓                   │
│         Clique no texto             │
│                 ↓                   │
│   Evento sobe para div pai          │
│                 ↓                   │
│   onClick + stopPropagation         │
│                 ↓                   │
│   handleDepartmentToggle() ✅       │
└─────────────────────────────────────┘
```

## Checklist de Testes

1. Ir em **Configurações → Membros**
2. Clicar **Convidar membro**
3. Selecionar **Atendente**
4. Testar cliques em:
   - [ ] Checkbox (quadrado vermelho) → deve funcionar
   - [ ] Bolinha colorida → deve funcionar
   - [ ] Nome do departamento (texto) → deve funcionar
   - [ ] Espaço vazio na linha → deve funcionar
5. Verificar que a contagem "X selecionados" atualiza corretamente
6. Verificar que a tela **NÃO** fica preta

## Risco

**Mínimo** - Apenas removemos uma propriedade CSS que estava causando o problema. Alinhamos com o código que já funciona em Settings.tsx.
