-- Add default_handler_type to tray_chat_integrations
-- This allows configuring if widget conversations go to AI or Human by default
ALTER TABLE public.tray_chat_integrations
ADD COLUMN IF NOT EXISTS default_handler_type TEXT DEFAULT 'human' CHECK (default_handler_type IN ('human', 'ai'));

-- Add default_human_agent_id for when handler is human
ALTER TABLE public.tray_chat_integrations
ADD COLUMN IF NOT EXISTS default_human_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Comment for clarity
COMMENT ON COLUMN public.tray_chat_integrations.default_handler_type IS 'Whether new widget conversations should go to human or ai by default';
COMMENT ON COLUMN public.tray_chat_integrations.default_human_agent_id IS 'Default human agent to assign when default_handler_type is human';