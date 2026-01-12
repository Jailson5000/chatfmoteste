-- Add column to track if a message was revoked/deleted by the sender on WhatsApp
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT false;

-- Add column to store when the message was revoked
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Create index for filtering revoked messages if needed
CREATE INDEX IF NOT EXISTS idx_messages_is_revoked ON public.messages(is_revoked) WHERE is_revoked = true;

-- Add comment for documentation
COMMENT ON COLUMN public.messages.is_revoked IS 'Indicates if the message was deleted/revoked by the sender on WhatsApp';
COMMENT ON COLUMN public.messages.revoked_at IS 'Timestamp when the message was revoked';