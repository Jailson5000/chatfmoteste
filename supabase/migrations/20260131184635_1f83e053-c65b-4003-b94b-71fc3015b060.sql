-- First add the column if it doesn't exist
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id);

-- Add comment for documentation
COMMENT ON COLUMN conversations.archived_by IS 'ID do usuário que arquivou a conversa';

-- Create index for potential queries
CREATE INDEX IF NOT EXISTS idx_conversations_archived_by ON public.conversations(archived_by) WHERE archived_by IS NOT NULL;