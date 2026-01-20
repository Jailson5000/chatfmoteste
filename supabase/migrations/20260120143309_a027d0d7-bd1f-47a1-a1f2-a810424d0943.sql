-- Add awaiting_qr flag to track when instance is waiting for QR scan
-- This prevents auto-reconnect from trying to reconnect instances that need manual QR scan

ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS awaiting_qr boolean DEFAULT false;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_awaiting_qr 
ON public.whatsapp_instances(awaiting_qr) 
WHERE awaiting_qr = true;

COMMENT ON COLUMN public.whatsapp_instances.awaiting_qr IS 'True when instance is waiting for QR code scan. Prevents auto-reconnect attempts.';