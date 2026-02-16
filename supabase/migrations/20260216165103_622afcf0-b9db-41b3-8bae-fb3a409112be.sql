-- 1. CORRECAO DE BUG: get_global_ai_usage (SUM(quantity) -> SUM(count))
CREATE OR REPLACE FUNCTION public.get_global_ai_usage()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  current_month_start date;
  last_month_start date;
BEGIN
  -- Validar que é admin global
  IF NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'access_denied');
  END IF;

  current_month_start := date_trunc('month', now())::date;
  last_month_start := (date_trunc('month', now()) - interval '1 month')::date;

  SELECT jsonb_build_object(
    'current_month', jsonb_build_object(
      'ai_conversations', COALESCE((
        SELECT SUM(count) FROM usage_records 
        WHERE usage_type = 'ai_conversation' 
        AND period_start >= current_month_start
      ), 0),
      'tts_minutes', COALESCE((
        SELECT SUM(count) FROM usage_records 
        WHERE usage_type = 'tts_minutes' 
        AND period_start >= current_month_start
      ), 0)
    ),
    'last_month', jsonb_build_object(
      'ai_conversations', COALESCE((
        SELECT SUM(count) FROM usage_records 
        WHERE usage_type = 'ai_conversation' 
        AND period_start >= last_month_start 
        AND period_start < current_month_start
      ), 0),
      'tts_minutes', COALESCE((
        SELECT SUM(count) FROM usage_records 
        WHERE usage_type = 'tts_minutes' 
        AND period_start >= last_month_start 
        AND period_start < current_month_start
      ), 0)
    ),
    'total_companies', (SELECT COUNT(*) FROM companies WHERE status = 'active'),
    'last_webhook_cleanup', (
      SELECT value->>'ran_at' FROM system_settings WHERE key = 'last_webhook_cleanup'
    )
  ) INTO result;

  RETURN result;
END;
$function$;

-- 2. LIMPEZA: Atualizar cleanup_old_webhook_logs para 1 dia
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_logs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM webhook_logs
  WHERE created_at < now() - interval '1 day';

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
$function$;