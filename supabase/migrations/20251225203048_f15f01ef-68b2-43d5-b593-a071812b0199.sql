-- Add fields to support n8n AI integration flow
-- Add ai_summary to store lawyer-friendly summary from AI
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- Add needs_human_handoff to indicate when human takeover is required
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS needs_human_handoff BOOLEAN DEFAULT false;

-- Add n8n_last_response_at to track when n8n last responded
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS n8n_last_response_at TIMESTAMP WITH TIME ZONE;

-- Add delivered_at to messages table for tracking delivery status
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

-- Add status column to messages for more granular status tracking
-- Values: pending, sent, delivered, read, error
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';

-- Add index for faster queries on conversation status
CREATE INDEX IF NOT EXISTS idx_conversations_needs_human ON public.conversations(needs_human_handoff) WHERE needs_human_handoff = true;

-- Add index for messages by status
CREATE INDEX IF NOT EXISTS idx_messages_status ON public.messages(status);

-- Comment for documentation
COMMENT ON COLUMN public.conversations.ai_summary IS 'AI-generated summary for lawyers, populated by n8n workflow';
COMMENT ON COLUMN public.conversations.needs_human_handoff IS 'Flag indicating if conversation needs human intervention';
COMMENT ON COLUMN public.conversations.n8n_last_response_at IS 'Timestamp of last n8n response';
COMMENT ON COLUMN public.messages.delivered_at IS 'Timestamp when message was delivered (2 grey ticks)';
COMMENT ON COLUMN public.messages.status IS 'Message status: pending, sent, delivered, read, error';