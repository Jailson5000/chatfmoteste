
# Correção: Departamento "Finalizado" Não Aparece na Lista de Permissões

## Problema Identificado

Ao editar as permissões de um atendente, o departamento "Finalizado" não aparece na lista de departamentos disponíveis.

## Causa Raiz

**Arquivo:** `src/pages/Settings.tsx` - Linhas 703-711

O código filtra departamentos para o dialog de edição e exclui qualquer departamento cujo nome contenha "arquivado" **ou "finalizado"**:

```javascript
const activeDepartments = departments?.filter(d => {
  if (!d.is_active) return false;
  const nameLower = d.name.toLowerCase();
  if (nameLower.includes('arquivado') || nameLower.includes('finalizado')) {
    return false;  // <-- Remove "Finalizado" da lista!
  }
  return true;
}) || [];
```

Esse filtro foi adicionado porque "Arquivados" foi convertido em uma permissão especial (checkbox separado). Porém, "Finalizado" é um departamento normal de workflow e não deveria ser excluído.

## Solução

Remover `'finalizado'` do filtro, mantendo apenas `'arquivado'` (que tem o checkbox especial dedicado):

```javascript
const activeDepartments = departments?.filter(d => {
  if (!d.is_active) return false;
  const nameLower = d.name.toLowerCase();
  if (nameLower === 'arquivados' || nameLower === 'arquivado') {
    return false;
  }
  return true;
}) || [];
```

Mudança adicional: usar comparação **exata** (`===`) ao invés de `includes()` para evitar falsos positivos com departamentos que contenham "arquivado" como parte do nome (ex: "Pré-Arquivado" seria filtrado incorretamente com `includes`).

## Arquivo a Alterar

| Arquivo | Linhas | Mudanca |
|---------|--------|---------|
| `src/pages/Settings.tsx` | 703-711 | Remover "finalizado" do filtro e usar match exato para "arquivados" |

## Impacto

- **Risco:** Baixo - apenas remove uma exclusão incorreta
- **Retrocompatibilidade:** Total - departamentos que antes eram ocultados passam a aparecer
- O checkbox especial "Arquivados" continua funcionando normalmente
