-- Add is_pontual column to messages table for tracking pontual interventions
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_pontual boolean DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN public.messages.is_pontual IS 'Marks messages sent as pontual intervention (sent to WhatsApp without transferring from AI)';