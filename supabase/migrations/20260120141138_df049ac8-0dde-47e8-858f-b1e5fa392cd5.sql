-- Add columns to track auto-reconnection attempts
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS reconnect_attempts_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reconnect_attempt_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient querying of instances needing reconnection
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_reconnect 
ON public.whatsapp_instances(status, disconnected_since)
WHERE status IN ('connecting', 'disconnected');

-- Add comment explaining the columns
COMMENT ON COLUMN public.whatsapp_instances.reconnect_attempts_count IS 'Number of auto-reconnect attempts in the last hour';
COMMENT ON COLUMN public.whatsapp_instances.last_reconnect_attempt_at IS 'Timestamp of the last auto-reconnect attempt';