-- Add read_at column to track when messages were read
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add reply_to_message_id for quote/reply feature
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

-- Create index for faster unread count queries
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON public.messages (conversation_id, read_at);

-- Create index for reply lookups
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages (reply_to_message_id);

-- Function to mark messages as read
CREATE OR REPLACE FUNCTION public.mark_messages_as_read(
  _conversation_id UUID,
  _user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Only mark messages not from me and not already read
  UPDATE public.messages
  SET read_at = NOW()
  WHERE conversation_id = _conversation_id
    AND is_from_me = false
    AND read_at IS NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;