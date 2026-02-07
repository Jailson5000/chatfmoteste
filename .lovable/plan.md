
# Plano: Renomear "Arquivado / Finalizado" para "Arquivados"

## Alterações

### 1. `src/pages/Kanban.tsx`

**Linha 483** - Coluna arquivados (modo departamento):
```typescript
// De: name="Arquivado / Finalizado"
// Para: name="Arquivados"
```

**Linha 557** - Coluna arquivados (modo status):
```typescript
// De: name="Arquivado / Finalizado"
// Para: name="Arquivados"
```

### 2. `src/pages/Settings.tsx`

**Linha 801** - Opção de permissão:
```typescript
// De: <span className="text-sm font-medium">Arquivados / Finalizados</span>
// Para: <span className="text-sm font-medium">Arquivados</span>
```

## Resumo

| Arquivo | Linhas | Ação |
|---------|--------|------|
| Kanban.tsx | 483, 557 | Alterar nome da coluna |
| Settings.tsx | 801 | Alterar nome na permissão |

**Impacto**: Apenas mudança de texto, sem risco.
