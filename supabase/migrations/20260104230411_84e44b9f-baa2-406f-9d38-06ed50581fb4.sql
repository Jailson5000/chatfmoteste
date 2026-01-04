-- Add column to track which AI agent sent the message
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS ai_agent_id UUID REFERENCES public.automations(id) ON DELETE SET NULL;

-- Add column to store agent name for historical reference (in case agent is deleted)
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS ai_agent_name TEXT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_ai_agent_id ON public.messages(ai_agent_id);

-- Add comment for documentation
COMMENT ON COLUMN public.messages.ai_agent_id IS 'ID of the AI agent that generated this message';
COMMENT ON COLUMN public.messages.ai_agent_name IS 'Name of the AI agent at the time of message creation';