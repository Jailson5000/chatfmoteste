
# Correção: Departamento não atualiza visualmente na sidebar

## Causa Raiz

Bug na atualização otimista do `updateConversationDepartment` dentro de `useConversations.tsx`.

O código busca departamentos do cache do React Query usando a chave **errada**:

```text
ERRADO:  queryClient.getQueryData(["departments"])       --> undefined
CORRETO: queryClient.getQueryData(["departments", lawFirm?.id])
```

O `useDepartments` armazena os dados com a chave `["departments", lawFirmId]`, mas a atualização otimista procura em `["departments"]` (sem o ID do tenant). Como o resultado é sempre `undefined`, o campo `department` (o objeto com nome e cor) fica `null` na atualização otimista.

**Consequência**: O card na sidebar perde o badge de departamento imediatamente após a mudança. Após 3 segundos (quando expira o lock otimista), o refetch traz o dado correto, mas a experiência visual é ruim -- o badge desaparece e reaparece.

## Correção

### Arquivo: `src/hooks/useConversations.tsx` (~linha 715)

Trocar:
```typescript
const cachedDepartments = queryClient.getQueryData<any[]>(["departments"]);
```

Por:
```typescript
const cachedDepartments = queryClient.getQueryData<any[]>(["departments", lawFirm?.id]);
```

Isso permite que a atualização otimista encontre o departamento no cache e construa o objeto `{ id, name, color }` corretamente, mantendo o badge visível durante toda a transição.

## Risco

**Zero**. Apenas corrige a chave de leitura do cache. Nenhuma outra lógica é afetada.
