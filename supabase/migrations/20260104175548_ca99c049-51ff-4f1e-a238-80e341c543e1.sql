
-- Criar cron job para processar follow-ups a cada minuto
SELECT cron.schedule(
  'process-follow-ups-every-minute',
  '* * * * *',  -- A cada minuto
  $$
  SELECT net.http_post(
    url := 'https://jiragtersejnarxruqyd.supabase.co/functions/v1/process-follow-ups',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcmFndGVyc2VqbmFyeHJ1cXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzI2MTUsImV4cCI6MjA4MjAwODYxNX0.pt4s9pS-Isi-Y3uRQG68njQIX1QytgIP5cnpEv_wr_M"}'::jsonb,
    body := '{"scheduled": true}'::jsonb
  ) AS request_id;
  $$
);
