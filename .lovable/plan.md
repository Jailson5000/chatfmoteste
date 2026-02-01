
# Plano: Corrigir Erro "Invalid time value" nas Tarefas

## Problema Identificado

Ao clicar em uma tarefa existente, a página fica em branco com o erro no console:
```
Uncaught RangeError: Invalid time value
```

## Causa Raiz

O erro ocorre quando `new Date()` recebe uma string inválida (ou `null` que não foi tratado). A função `parseDateLocal` foi adicionada ao `TaskDetailSheet`, mas **outros componentes continuam usando `new Date(task.due_date)` diretamente**, causando o crash quando:

1. A data é `null` (embora haja verificações, podem falhar em edge cases)
2. A data vem em formato diferente do esperado "YYYY-MM-DD"
3. A data está corrompida no banco de dados

## Arquivos Afetados e Correções

| Arquivo | Linhas | Problema |
|---------|--------|----------|
| `TaskKanbanCard.tsx` | 94, 96, 259 | `new Date(task.due_date)` em `isPast()`, `isToday()`, `format()` |
| `TaskListView.tsx` | 88, 91, 157 | `new Date(task.due_date)` em `isPast()`, `isToday()`, `format()` |
| `TaskCalendarView.tsx` | 44 | `new Date(task.due_date)` em `isSameDay()` |
| `TaskDashboard.tsx` | 33, 40, 47 | `new Date(task.due_date)` em `isPast()`, `isToday()`, `isWithinInterval()` |

---

## Solução: Criar Utilitário Compartilhado

### 1. Criar `src/lib/dateUtils.ts`

Criar arquivo utilitário com a função `parseDateLocal` para reutilização:

```typescript
/**
 * Parseia string de data no formato YYYY-MM-DD como horário local.
 * Evita bug de fuso horário onde new Date("2026-02-03") 
 * é interpretado como UTC e pode virar dia anterior.
 */
export function parseDateLocal(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  
  // Se for ISO timestamp completo, usar diretamente
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  }
  
  // Se for formato YYYY-MM-DD, parsear como local
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  
  return new Date(year, month - 1, day);
}
```

### 2. Atualizar `TaskKanbanCard.tsx`

```typescript
// Importar utilitário
import { parseDateLocal } from "@/lib/dateUtils";

// Linhas 92-96: Usar parseDateLocal
const dueDateParsed = task.due_date ? parseDateLocal(task.due_date) : null;
const isOverdue = dueDateParsed && isPast(dueDateParsed) && !isDone;
const isDueToday = dueDateParsed && isToday(dueDateParsed);

// Linha 259: Usar dueDateParsed já calculado
{dueDateParsed && format(dueDateParsed, "dd/MM", { locale: ptBR })}
```

### 3. Atualizar `TaskListView.tsx`

```typescript
// Importar utilitário
import { parseDateLocal } from "@/lib/dateUtils";

// Linhas 86-91: Calcular data uma vez
const dueDateParsed = task.due_date ? parseDateLocal(task.due_date) : null;
const isOverdue = dueDateParsed && isPast(dueDateParsed) && task.status !== "done";
const isDueToday = dueDateParsed && isToday(dueDateParsed);

// Linha 157: Usar dueDateParsed
{dueDateParsed && format(dueDateParsed, "dd/MM/yyyy", { locale: ptBR })}
```

### 4. Atualizar `TaskCalendarView.tsx`

```typescript
// Importar utilitário
import { parseDateLocal } from "@/lib/dateUtils";

// Linha 44: Usar parseDateLocal
const getTasksForDay = (date: Date) =>
  tasks.filter((task) => {
    const taskDate = parseDateLocal(task.due_date);
    return taskDate && isSameDay(taskDate, date);
  });
```

### 5. Atualizar `TaskDashboard.tsx`

```typescript
// Importar utilitário
import { parseDateLocal } from "@/lib/dateUtils";

// Linhas 30-48: Usar parseDateLocal em todos os cálculos
const overdue = tasks.filter((t) => {
  const date = parseDateLocal(t.due_date);
  return date && isPast(date) && t.status !== "done";
}).length;

const dueToday = tasks.filter((t) => {
  const date = parseDateLocal(t.due_date);
  return date && isToday(date) && t.status !== "done";
}).length;

const dueThisWeek = tasks.filter((t) => {
  const date = parseDateLocal(t.due_date);
  return date && isWithinInterval(date, { start: weekStart, end: weekEnd }) && t.status !== "done";
}).length;
```

### 6. Atualizar `TaskDetailSheet.tsx`

Remover função local e usar utilitário compartilhado:

```typescript
import { parseDateLocal } from "@/lib/dateUtils";

// Remover linhas 96-100 (função local parseDateLocal)
```

---

## Resumo das Alterações

| Arquivo | Tipo de Alteração |
|---------|------------------|
| `src/lib/dateUtils.ts` | **CRIAR** - Utilitário compartilhado |
| `TaskKanbanCard.tsx` | Substituir `new Date()` por `parseDateLocal()` |
| `TaskListView.tsx` | Substituir `new Date()` por `parseDateLocal()` |
| `TaskCalendarView.tsx` | Substituir `new Date()` por `parseDateLocal()` |
| `TaskDashboard.tsx` | Substituir `new Date()` por `parseDateLocal()` |
| `TaskDetailSheet.tsx` | Usar utilitário compartilhado em vez de função local |

---

## Segurança e Isolamento

- Sem alteração em banco de dados ou RLS
- Correção estritamente no frontend
- Não afeta outros módulos do sistema (chat, kanban, agenda, etc.)
- Função utilitária é defensiva: retorna `null` se string for inválida

---

## Resultado Esperado

1. **Clicar em tarefa**: Sheet de detalhes abre corretamente
2. **Visualização Kanban**: Cards exibem datas sem crash
3. **Visualização Lista**: Tabela exibe datas corretamente
4. **Calendário**: Tarefas aparecem nos dias corretos
5. **Dashboard**: Estatísticas calculadas sem erro

