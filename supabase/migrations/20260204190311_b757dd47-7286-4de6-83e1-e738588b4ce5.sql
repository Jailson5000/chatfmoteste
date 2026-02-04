-- Create cleanup function for webhook_logs
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete logs older than 7 days
  DELETE FROM webhook_logs
  WHERE created_at < now() - interval '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup result to system_settings for monitoring
  INSERT INTO system_settings (key, value, description, category, updated_at)
  VALUES (
    'last_webhook_cleanup',
    jsonb_build_object(
      'deleted', deleted_count,
      'ran_at', now()
    ),
    'Último resultado da limpeza automática de webhook_logs',
    'maintenance',
    now()
  )
  ON CONFLICT (key) DO UPDATE 
  SET value = EXCLUDED.value, updated_at = now();
  
  RETURN deleted_count;
END;
$$;

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;