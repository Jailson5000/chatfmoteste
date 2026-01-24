-- Fix cron job for processing scheduled messages
-- The current job uses current_setting which may not be configured properly

-- First, drop the existing broken job
SELECT cron.unschedule('process-agenda-pro-scheduled-messages');

-- Create new job with hardcoded URL (like the working birthday job)
SELECT cron.schedule(
  'process-agenda-pro-scheduled-messages',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jiragtersejnarxruqyd.supabase.co/functions/v1/process-scheduled-messages',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcmFndGVyc2VqbmFyeHJ1cXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzI2MTUsImV4cCI6MjA4MjAwODYxNX0.pt4s9pS-Isi-Y3uRQG68njQIX1QytgIP5cnpEv_wr_M"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);