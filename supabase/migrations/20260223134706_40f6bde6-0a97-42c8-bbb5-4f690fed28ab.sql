CREATE OR REPLACE FUNCTION public.get_global_ai_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  current_period text;
  last_period text;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'access_denied');
  END IF;

  current_period := to_char(now(), 'YYYY-MM');
  last_period := to_char(now() - interval '1 month', 'YYYY-MM');

  SELECT jsonb_build_object(
    'current_month', jsonb_build_object(
      'ai_conversations', COALESCE((
        SELECT SUM(count) FROM usage_records
        WHERE usage_type = 'ai_conversation'
        AND billing_period = current_period
      ), 0),
      'tts_minutes', COALESCE((
        SELECT SUM(count) FROM usage_records
        WHERE usage_type = 'tts_minutes'
        AND billing_period = current_period
      ), 0)
    ),
    'last_month', jsonb_build_object(
      'ai_conversations', COALESCE((
        SELECT SUM(count) FROM usage_records
        WHERE usage_type = 'ai_conversation'
        AND billing_period = last_period
      ), 0),
      'tts_minutes', COALESCE((
        SELECT SUM(count) FROM usage_records
        WHERE usage_type = 'tts_minutes'
        AND billing_period = last_period
      ), 0)
    ),
    'total_companies', (SELECT COUNT(*) FROM companies WHERE status = 'active'),
    'last_webhook_cleanup', (
      SELECT value->>'ran_at' FROM system_settings WHERE key = 'last_webhook_cleanup'
    )
  ) INTO result;

  RETURN result;
END;
$$;