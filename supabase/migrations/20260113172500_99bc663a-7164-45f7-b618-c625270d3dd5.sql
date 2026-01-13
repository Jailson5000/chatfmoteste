-- Add is_starred column to messages table for favorite functionality
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false;

-- Create index for quick lookup of starred messages
CREATE INDEX IF NOT EXISTS idx_messages_is_starred ON public.messages(is_starred) WHERE is_starred = true;