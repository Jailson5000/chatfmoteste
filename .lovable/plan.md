

## Adicionar 4 features em todos os planos

### O que sera feito
Adicionar as seguintes features na lista de todos os 5 planos (PRIME, BASIC, STARTER, PROFESSIONAL, ENTERPRISE):

- Agendamento inteligente
- Follow-ups automaticos
- Kanban avancado
- Gestao de tarefas

### Implementacao
Um UPDATE no campo `features` (jsonb array) da tabela `plans` para cada um dos 5 planos, concatenando as 4 novas features ao array existente.

Nenhuma alteracao de codigo frontend e necessaria -- os cards da landing page e do painel admin ja renderizam as features dinamicamente a partir do banco.

### SQL a ser executado
```sql
UPDATE public.plans 
SET features = features || '["Agendamento inteligente", "Follow-ups automáticos", "Kanban avançado", "Gestão de tarefas"]'::jsonb,
    updated_at = now()
WHERE name IN ('PRIME', 'BASIC', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');
```

