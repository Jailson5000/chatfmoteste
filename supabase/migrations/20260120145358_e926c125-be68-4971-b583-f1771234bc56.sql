-- Add flag to track if alert was sent for current disconnection cycle
-- This prevents multiple alerts for the same disconnection event
-- The flag is reset when the instance successfully reconnects
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS alert_sent_for_current_disconnect BOOLEAN DEFAULT false;