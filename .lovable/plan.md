

# Ajuste: Reduzir Tamanho do Banner de Conversa Arquivada

## Problema Identificado

O banner de "Conversa arquivada" está ocupando muito espaço na tela com:
- Padding grande (`p-3`)
- Fontes com tamanho padrão (`text-sm`)
- Ícone de 16px (`h-4 w-4`)
- Margens extras (`mx-4 my-2`)

## Solução

Reduzir todos os elementos do banner para uma versão mais compacta:

| Elemento | Atual | Novo |
|----------|-------|------|
| Padding | `p-3` | `p-2` |
| Margens | `mx-4 my-2` | `mx-3 my-1.5` |
| Ícone | `h-4 w-4` | `h-3 w-3` |
| Título | `font-medium` (14px) | `text-xs font-medium` |
| Textos | `text-sm` | `text-xs` |
| Espaçamento interno | `mt-1` | `mt-0.5` |

## Código Atualizado

```tsx
{/* Archived Conversation Banner - Compact version */}
{selectedConversation.archived_at && (
  <div className="bg-orange-100 dark:bg-orange-900/30 border-l-4 border-orange-500 p-2 mx-3 my-1.5 rounded">
    <div className="flex items-center gap-1.5">
      <Archive className="h-3 w-3 text-orange-600 dark:text-orange-400" />
      <span className="text-xs font-medium text-orange-800 dark:text-orange-200">
        Conversa arquivada
      </span>
    </div>
    <div className="text-xs text-orange-700 dark:text-orange-300 mt-0.5">
      {(selectedConversation as any).archived_by_name && 
        `Por: ${(selectedConversation as any).archived_by_name} • `}
      Em: {new Date(selectedConversation.archived_at).toLocaleString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      })}
    </div>
    {selectedConversation.archived_reason && (
      <div className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
        Motivo: {selectedConversation.archived_reason}
      </div>
    )}
  </div>
)}
```

## Comparação Visual

### Antes
- Altura estimada: ~70-80px
- Fonte maior, mais espaçamento

### Depois
- Altura estimada: ~45-50px
- Fonte menor (`text-xs` = 12px), espaçamento reduzido
- Mais compacto sem perder legibilidade

## Arquivo Afetado

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Conversations.tsx` | Linhas 3944-3969: reduzir padding, fonte e ícone |

