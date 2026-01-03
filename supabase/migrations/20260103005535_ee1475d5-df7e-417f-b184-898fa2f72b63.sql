-- Add current_automation_id to track which AI is handling this specific conversation
ALTER TABLE public.conversations 
ADD COLUMN current_automation_id uuid REFERENCES public.automations(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX idx_conversations_current_automation ON public.conversations(current_automation_id) WHERE current_automation_id IS NOT NULL;

-- Comment explaining the field
COMMENT ON COLUMN public.conversations.current_automation_id IS 'The specific AI agent assigned to this conversation. When set, this takes priority over instance/company defaults.';