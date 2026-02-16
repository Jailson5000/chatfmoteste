

# Otimizacao de Crons para Escalar ate 30-50 Empresas

## Problema Atual

Os cron jobs consomem **~125.310 invocacoes/mes** de Edge Functions -- **25% do limite de 500k** do plano Pro. Isso deixa apenas ~375k invocacoes para webhooks de mensagens reais. Com 30 empresas enviando ~500 msgs/dia, os webhooks sozinhos consumiriam ~450k/mes, estourando o limite.

## Crons que podem ser otimizados

### 1. `auto-reconnect-every-minute` -- de `* * * * *` para `*/5 * * * *`
- **Economia**: 43.200 → 8.640 (-34.560/mes)
- **Risco**: Instancias desconectadas levarao ate 5 minutos para reconectar em vez de 1
- **Aceitavel?** Sim. Reconexao em 5 minutos e imperceptivel para o usuario. O webhook da Evolution API ja notifica desconexoes em tempo real

### 2. `process-follow-ups-every-minute` -- de `* * * * *` para `*/2 * * * *`
- **Economia**: 43.200 → 21.600 (-21.600/mes)
- **Risco**: Follow-ups podem atrasar ate 2 minutos em vez de 1
- **Aceitavel?** Sim. Follow-ups sao agendados com delay de horas/dias. 2 minutos de variacao e irrelevante

### 3. `process-birthday-messages` -- de `*/5 * * * *` para `0 * * * *` (1x por hora)
- **Economia**: 8.640 → 720 (-7.920/mes)
- **Risco**: Nenhum. Aniversarios sao verificados por dia, nao por minuto
- **Aceitavel?** Sim. 1x por hora e mais que suficiente

### 4. `retry-failed-n8n-workflows` -- de `*/15 * * * *` para `0 */2 * * *` (a cada 2 horas)
- **Economia**: 2.880 → 360 (-2.520/mes)
- **Risco**: Workflows falhados esperam ate 2h para retry em vez de 15min
- **Aceitavel?** Sim. Retries nao sao urgentes

## O que NAO mudar

| Job | Por que manter |
|-----|---------------|
| `check-instance-alerts` (`*/5`) | Ja esta em 5min, adequado para alertas de infra |
| `process-agenda-pro-scheduled-messages` (`*/5`) | Mensagens agendadas para hora especifica precisam de precisao |
| `process-appointment-reminders` (`*/5`) | Lembretes de consulta sao sensiveis ao tempo |
| `tenant-health-check` (`0 * * * *`) | Ja e 1x por hora |
| `process-task-due-alerts-hourly` (`0 * * * *`) | Ja e 1x por hora |
| `process-trial-reminders-daily` (`0 12 * * *`) | Ja e 1x por dia |

## Resultado da Otimizacao

| Metrica | Antes | Depois | Economia |
|---------|-------|--------|----------|
| Invocacoes de cron/mes | ~125.310 | ~58.630 | **-66.680 (-53%)** |
| % do limite 500k usado por crons | 25% | 12% | **-13 pontos** |
| Invocacoes disponiveis para webhooks | ~375k | ~441k | **+66k** |

### Capacidade estimada apos otimizacao

- Com ~441k invocacoes disponiveis para webhooks
- Cada mensagem = 1 invocacao (webhook da Evolution API)
- **30 empresas x 500 msgs/dia = 450k/mes** -- fica no limite
- **25 empresas x 500 msgs/dia = 375k/mes** -- confortavel

**Conclusao**: A otimizacao dos crons permite suportar **ate ~25-28 empresas** no plano Pro com folga, e **30 empresas** no limite. Para 50+ empresas, o upgrade de plano continua sendo necessario.

## Implementacao

A alteracao e feita exclusivamente via SQL (atualizar os schedules dos cron jobs existentes). Nenhum arquivo de codigo precisa ser alterado.

```sql
-- 1. auto-reconnect: de * * * * * para */5 * * * *
SELECT cron.unschedule('auto-reconnect-every-minute');
SELECT cron.schedule(
  'auto-reconnect-every-5min',
  '*/5 * * * *',
  $$ SELECT net.http_post(
    url:='https://jiragtersejnarxruqyd.supabase.co/functions/v1/auto-reconnect-instances',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ANON_KEY"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  ) AS request_id; $$
);

-- 2. follow-ups: de * * * * * para */2 * * * *
SELECT cron.unschedule('process-follow-ups-every-minute');
SELECT cron.schedule(
  'process-follow-ups-every-2min',
  '*/2 * * * *',
  $$ SELECT net.http_post(
    url:='https://jiragtersejnarxruqyd.supabase.co/functions/v1/process-follow-ups',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ANON_KEY"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  ) AS request_id; $$
);

-- 3. birthday: de */5 * * * * para 0 * * * *
SELECT cron.unschedule('process-birthday-messages');
SELECT cron.schedule(
  'process-birthday-messages-hourly',
  '0 * * * *',
  $$ SELECT net.http_post(
    url:='https://jiragtersejnarxruqyd.supabase.co/functions/v1/process-birthday-messages',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ANON_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id; $$
);

-- 4. retry-n8n: de */15 * * * * para 0 */2 * * *
SELECT cron.unschedule('retry-failed-n8n-workflows');
SELECT cron.schedule(
  'retry-failed-n8n-workflows-2h',
  '0 */2 * * *',
  $$ SELECT net.http_post(
    url:='https://jiragtersejnarxruqyd.supabase.co/functions/v1/retry-failed-workflows',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ANON_KEY"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  ) AS request_id; $$
);
```

## Riscos

| Risco | Probabilidade | Mitigacao |
|-------|--------------|----------|
| Follow-up atrasa 2min | Certa (mas irrelevante) | Follow-ups sao agendados com horas/dias de antecedencia |
| Reconexao WhatsApp demora 5min | Baixa (webhook ja notifica) | Usuarios podem reconectar manualmente pelo painel |
| Birthday duplicado se rodar mais de 1x/hora | Zero | A funcao ja verifica `last_birthday_sent_at` |

## Como reverter

Basta rodar `cron.unschedule` nos novos jobs e recriar os antigos com os schedules originais.

## Nenhum arquivo frontend alterado

Toda a implementacao e via SQL no banco de dados.

