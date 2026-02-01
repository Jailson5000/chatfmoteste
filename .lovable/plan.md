
# Plano: Corrigir Bug de Data "1 Dia a Menos" Definitivamente

## Problema Identificado

A data retrocede 1 dia após alguns segundos porque:

1. A coluna `due_date` é do tipo `timestamptz` (timestamp with time zone)
2. Quando o banco retorna `2026-02-10T00:00:00+00:00` (meia-noite UTC)
3. A função `parseDateLocal` detecta o `T` e usa `new Date()` que interpreta como UTC
4. Ao exibir no Brasil (UTC-3), `2026-02-10 00:00:00 UTC` vira `2026-02-09 21:00:00 local`
5. O `format()` mostra dia 09 em vez de dia 10

## Causa Raiz no Código

```typescript
// src/lib/dateUtils.ts - PROBLEMA
if (dateStr.includes('T')) {
  const date = new Date(dateStr);  // ← Interpreta como UTC!
  return isNaN(date.getTime()) ? null : date;
}
```

---

## Solução

Modificar `parseDateLocal` para SEMPRE extrair apenas a parte da data (YYYY-MM-DD) e parsear como horário local, ignorando qualquer componente de hora ou timezone:

```typescript
export function parseDateLocal(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  
  // Extrair apenas a parte da data (YYYY-MM-DD)
  // Funciona com: "2026-02-10", "2026-02-10T00:00:00", "2026-02-10 00:00:00+00"
  const dateOnly = dateStr.split('T')[0].split(' ')[0];
  
  const parts = dateOnly.split('-');
  if (parts.length !== 3) return null;
  
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  
  // Criar data como horário LOCAL (não UTC)
  return new Date(year, month - 1, day);
}
```

---

## Fluxo Corrigido

| Etapa | Antes (Bug) | Depois (Corrigido) |
|-------|-------------|-------------------|
| Usuário seleciona | 10/02/2026 | 10/02/2026 |
| Salva no DB | `"2026-02-10"` | `"2026-02-10"` |
| DB retorna | `"2026-02-10T00:00:00+00"` | `"2026-02-10T00:00:00+00"` |
| `parseDateLocal` extrai | `new Date("2026-02-10T00:00:00+00")` → UTC | `"2026-02-10"` → `new Date(2026, 1, 10)` local |
| `format()` exibe | **09/02/2026** (errado) | **10/02/2026** (correto) |

---

## Sobre Alertas

O sistema de alertas já está funcionando corretamente:

- Quando `due_date` é alterada, o hook `useTasks` deleta os registros antigos de `task_alert_logs`
- Isso permite que a edge function `process-task-due-alerts` envie novos alertas para a nova data
- A exclusão de tarefas já remove os logs automaticamente via `ON DELETE CASCADE`

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/dateUtils.ts` | Reescrever `parseDateLocal` para extrair apenas YYYY-MM-DD |

---

## Segurança

- Sem alterações no banco de dados
- Sem alterações em RLS
- Correção isolada apenas na função de parsing de data
- Não afeta outros módulos do sistema
