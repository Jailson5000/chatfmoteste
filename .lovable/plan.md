

# Plano: Correções Completas do Módulo de Tarefas

## Problemas Identificados

| # | Problema | Causa |
|---|----------|-------|
| 1 | Data mostra 1 dia a menos (ex: seleciona 28, mostra 27) | `toISOString()` converte para UTC antes de extrair a data |
| 2 | Alerta de tarefa quando muda a data | Precisa apagar logs antigos de alerta para permitir novo envio |
| 3 | Alertas não são apagados ao excluir tarefa | Já resolvido - tem `ON DELETE CASCADE` |
| 4 | Demora nas alterações | Múltiplas queries sequenciais e falta de `optimistic update` |

---

## Correção 1: Bug de Data (1 dia a menos)

### Causa Raiz

Quando o usuário seleciona uma data no calendário (ex: 28/02/2026), o componente `Calendar` retorna um objeto `Date` local:

```javascript
// Usuário seleciona 28/02/2026 no Brasil (UTC-3)
date = new Date(2026, 1, 28) // 28/02/2026 00:00:00 (horário local)

// Ao salvar:
date.toISOString() // "2026-02-27T03:00:00.000Z" ← Converte para UTC!
date.toISOString().split("T")[0] // "2026-02-27" ← DIA ERRADO!
```

### Solução

Criar função `formatDateForDatabase` que extrai ano/mês/dia locais diretamente:

```typescript
// Em src/lib/dateUtils.ts
export function formatDateForDatabase(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

### Arquivos a Modificar

| Arquivo | Linha | Mudança |
|---------|-------|---------|
| `src/lib/dateUtils.ts` | Novo | Adicionar `formatDateForDatabase` |
| `src/components/tasks/TaskDetailSheet.tsx` | 175 | `date.toISOString().split("T")[0]` → `formatDateForDatabase(date)` |
| `src/components/tasks/NewTaskDialog.tsx` | 101 | `data.due_date?.toISOString()` → `formatDateForDatabase(data.due_date!)` |

---

## Correção 2: Alerta quando muda a data

Quando a data de vencimento é alterada, os logs de alerta antigos devem ser removidos para permitir que um novo alerta seja enviado na nova data.

### Solução

No hook `useTasks.tsx`, ao atualizar `due_date`, deletar os registros correspondentes em `task_alert_logs`:

```typescript
// Se a data foi alterada, limpar logs de alerta antigos
if (updates.due_date !== undefined) {
  await supabase
    .from("task_alert_logs")
    .delete()
    .eq("task_id", id);
}
```

### Arquivo a Modificar

| Arquivo | Linha | Mudança |
|---------|-------|---------|
| `src/hooks/useTasks.tsx` | ~234 | Adicionar lógica para limpar `task_alert_logs` |

---

## Correção 3: Alertas ao excluir tarefa

**Status**: Já implementado corretamente!

A tabela `task_alert_logs` já possui `ON DELETE CASCADE` na foreign key `task_id`:

```sql
FOREIGN KEY (task_id) REFERENCES internal_tasks(id) ON DELETE CASCADE
```

Quando uma tarefa é excluída, os logs de alerta são automaticamente removidos.

---

## Correção 4: Lentidão nas alterações

### Causa

O hook `useTasks` usa `invalidateQueries` após cada mutation, forçando um refetch completo da lista. Isso causa:

1. Delay visual (espera o servidor responder)
2. Múltiplas queries desnecessárias
3. Percepção de lentidão

### Solução

Implementar **Optimistic Updates** para atualização instantânea da UI:

```typescript
const updateTask = useMutation({
  mutationFn: async (input: UpdateTaskInput) => { /* ... */ },
  onMutate: async (input) => {
    // Cancelar queries em andamento
    await queryClient.cancelQueries({ queryKey: ["internal_tasks"] });
    
    // Salvar estado anterior
    const previousTasks = queryClient.getQueryData(["internal_tasks", lawFirm?.id]);
    
    // Atualizar cache otimisticamente
    queryClient.setQueryData(["internal_tasks", lawFirm?.id], (old: Task[]) =>
      old?.map(task => task.id === input.id ? { ...task, ...input } : task)
    );
    
    return { previousTasks };
  },
  onError: (err, input, context) => {
    // Reverter em caso de erro
    queryClient.setQueryData(["internal_tasks", lawFirm?.id], context?.previousTasks);
  },
  onSettled: () => {
    // Revalidar para garantir sincronização
    queryClient.invalidateQueries({ queryKey: ["internal_tasks"] });
  },
});
```

### Benefícios

- UI atualiza instantaneamente
- Experiência mais fluida
- Rollback automático se houver erro

---

## Resumo das Alterações

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `src/lib/dateUtils.ts` | Adicionar função | `formatDateForDatabase()` |
| `src/components/tasks/TaskDetailSheet.tsx` | Correção | Usar `formatDateForDatabase` |
| `src/components/tasks/NewTaskDialog.tsx` | Correção | Usar `formatDateForDatabase` |
| `src/hooks/useTasks.tsx` | Correção | Limpar alert logs ao mudar data |
| `src/hooks/useTasks.tsx` | Otimização | Adicionar optimistic updates |

---

## Segurança e Isolamento

- Sem alterações no banco de dados
- Sem alterações em RLS policies
- Alterações isoladas ao módulo de tarefas
- Não afeta outros módulos (chat, kanban clientes, agenda)

