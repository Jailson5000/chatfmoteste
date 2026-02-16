

# Reduzir retry-failed-n8n-workflows para 1x por dia (23h)

## Justificativa

O N8N nao esta sendo utilizado no projeto atualmente. Manter o cron rodando a cada 2 horas consome **360 invocacoes/mes** desnecessariamente. Reduzir para 1x por dia as 23h reduz para **30 invocacoes/mes**.

## Alteracao

| Job | Antes | Depois | Economia |
|-----|-------|--------|----------|
| `retry-failed-n8n-workflows-2h` | `0 */2 * * *` (12x/dia) | `0 23 * * *` (1x/dia) | -330/mes |

## Implementacao (SQL)

```sql
SELECT cron.unschedule('retry-failed-n8n-workflows-2h');
SELECT cron.schedule(
  'retry-failed-n8n-workflows-daily',
  '0 23 * * *',
  $$ SELECT net.http_post(
    url:='https://jiragtersejnarxruqyd.supabase.co/functions/v1/retry-failed-workflows',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcmFndGVyc2VqbmFyeHJ1cXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzI2MTUsImV4cCI6MjA4MjAwODYxNX0.pt4s9pS-Isi-Y3uRQG68njQIX1QytgIP5cnpEv_wr_M"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  ) AS request_id; $$
);
```

## Impacto total atualizado dos crons

| Metrica | Antes (pos-otimizacao anterior) | Depois | Economia |
|---------|------|--------|----------|
| Invocacoes cron/mes | ~58.630 | ~58.300 | -330 |

Economia pequena mas consistente com a estrategia de nao gastar invocacoes com funcionalidade inativa.

## Risco

Zero. O job so processa empresas com `n8n_workflow_status IN ('error', 'failed', 'pending')`. Se nao ha nenhuma, retorna imediatamente sem fazer nada. Rodar 1x por dia e mais que suficiente como safety net caso o N8N seja ativado no futuro.

## Nenhum arquivo frontend alterado

Apenas SQL via banco de dados.

