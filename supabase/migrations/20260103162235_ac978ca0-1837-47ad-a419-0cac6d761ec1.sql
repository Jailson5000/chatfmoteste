-- Add archiving metadata to conversations without touching existing status enum
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS archived_reason TEXT,
ADD COLUMN IF NOT EXISTS archived_next_responsible_type TEXT,
ADD COLUMN IF NOT EXISTS archived_next_responsible_id UUID;

-- Optional index to speed up archived tab queries
CREATE INDEX IF NOT EXISTS idx_conversations_archived_at
ON public.conversations (archived_at)
WHERE archived_at IS NOT NULL;