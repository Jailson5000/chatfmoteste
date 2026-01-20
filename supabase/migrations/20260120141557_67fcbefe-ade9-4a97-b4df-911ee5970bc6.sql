-- Add column to track if disconnection was manual (user logout)
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS manual_disconnect BOOLEAN DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN public.whatsapp_instances.manual_disconnect IS 'True when user explicitly logged out - prevents auto-reconnect attempts';