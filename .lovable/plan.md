

# Reduzir Retencao de webhook_logs para 3 Dias

## O que muda

A funcao `cleanup_old_webhook_logs()` ja existe e roda diariamente as 3h da manha via cron job. A unica alteracao e trocar `interval '7 days'` para `interval '3 days'`.

## Economia estimada

- Hoje: 168 MB em webhook_logs (173.701 linhas)
- Apos primeira execucao: ~72 MB (economia de ~96 MB, ou ~57% dos logs)
- Efeito continuo: mantem o volume de logs sempre menor

## Risco

**Muito baixo.** Os logs sao usados apenas para debug no painel Global Admin. O componente `WebhookLogsViewer` ja usa `LIMIT 50`, mostrando apenas os 50 mais recentes. Tres dias e mais que suficiente para diagnosticar qualquer problema.

## Como reverter

Rodar outra migration trocando de volta para `interval '7 days'`. Nenhum dado critico e perdido.

## Implementacao

Uma unica migration SQL que recria a funcao:

```sql
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM webhook_logs
  WHERE created_at < now() - interval '3 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  INSERT INTO system_settings (key, value, description, category, updated_at)
  VALUES (
    'last_webhook_cleanup',
    jsonb_build_object('deleted', deleted_count, 'ran_at', now()),
    'Ultimo resultado da limpeza automatica de webhook_logs',
    'maintenance',
    now()
  )
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now();

  RETURN deleted_count;
END;
$$;
```

Nenhum arquivo frontend precisa ser alterado.

