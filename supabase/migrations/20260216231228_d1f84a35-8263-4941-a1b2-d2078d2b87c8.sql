-- Drop the old partial unique index that only covers 'pending'
DROP INDEX IF EXISTS idx_ai_queue_pending_conversation;

-- Create a new partial unique index that covers both 'pending' AND 'processing'
-- This prevents having more than 1 active item per conversation at the database level
CREATE UNIQUE INDEX idx_ai_queue_active_conversation 
  ON public.ai_processing_queue(conversation_id) 
  WHERE status IN ('pending', 'processing');