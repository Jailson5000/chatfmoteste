-- Add last_webhook_event column to track diagnostics
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS last_webhook_event text,
ADD COLUMN IF NOT EXISTS last_webhook_at timestamp with time zone;