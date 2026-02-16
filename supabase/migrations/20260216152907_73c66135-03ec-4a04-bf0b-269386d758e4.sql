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