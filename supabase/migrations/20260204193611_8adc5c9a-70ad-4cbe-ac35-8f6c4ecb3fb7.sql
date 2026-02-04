-- 1. Função RPC segura para consultar tamanho do banco (apenas admin global)
CREATE OR REPLACE FUNCTION public.get_database_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Validar que é admin global
  IF NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'access_denied');
  END IF;

  SELECT jsonb_build_object(
    'database_size_bytes', pg_database_size(current_database()),
    'database_size_pretty', pg_size_pretty(pg_database_size(current_database())),
    'database_limit_bytes', 8589934592,
    'database_limit_pretty', '8 GB',
    'percent_used', ROUND((pg_database_size(current_database())::numeric / 8589934592) * 100, 2)
  ) INTO result;

  RETURN result;
END;
$$;

-- 2. Função RPC para consultar tamanho do storage
CREATE OR REPLACE FUNCTION public.get_storage_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  total_bytes bigint;
BEGIN
  -- Validar que é admin global
  IF NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'access_denied');
  END IF;

  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
  INTO total_bytes
  FROM storage.objects;

  SELECT jsonb_build_object(
    'storage_size_bytes', total_bytes,
    'storage_size_pretty', pg_size_pretty(total_bytes),
    'storage_limit_bytes', 107374182400,
    'storage_limit_pretty', '100 GB',
    'percent_used', ROUND((total_bytes::numeric / 107374182400) * 100, 2),
    'buckets', (
      SELECT jsonb_agg(jsonb_build_object(
        'bucket', bucket_id,
        'size_bytes', bucket_size,
        'size_pretty', pg_size_pretty(bucket_size),
        'file_count', file_count
      ))
      FROM (
        SELECT 
          bucket_id,
          COALESCE(SUM((metadata->>'size')::bigint), 0) as bucket_size,
          COUNT(*) as file_count
        FROM storage.objects
        GROUP BY bucket_id
      ) buckets
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- 3. Função RPC para consultar uso global de IA
CREATE OR REPLACE FUNCTION public.get_global_ai_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
        SELECT SUM(quantity) FROM usage_records 
        WHERE usage_type = 'ai_conversation' 
        AND period_start >= current_month_start
      ), 0),
      'tts_minutes', COALESCE((
        SELECT SUM(quantity) FROM usage_records 
        WHERE usage_type = 'tts_minutes' 
        AND period_start >= current_month_start
      ), 0)
    ),
    'last_month', jsonb_build_object(
      'ai_conversations', COALESCE((
        SELECT SUM(quantity) FROM usage_records 
        WHERE usage_type = 'ai_conversation' 
        AND period_start >= last_month_start 
        AND period_start < current_month_start
      ), 0),
      'tts_minutes', COALESCE((
        SELECT SUM(quantity) FROM usage_records 
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
$$;

-- 4. Tabela para tracking de alertas enviados (evita spam)
CREATE TABLE IF NOT EXISTS public.infrastructure_alert_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  threshold_level text NOT NULL,
  metric_value numeric,
  metric_limit numeric,
  alert_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(alert_type, threshold_level, alert_date)
);

-- RLS
ALTER TABLE public.infrastructure_alert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can manage alerts"
ON public.infrastructure_alert_history
FOR ALL
TO authenticated
USING (is_admin(auth.uid()));