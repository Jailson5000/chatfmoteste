-- Remove the overly restrictive index that blocks pending + processing together
DROP INDEX IF EXISTS idx_ai_queue_active_conversation;

-- Keep: at most 1 pending per conversation
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_queue_pending_conversation 
  ON public.ai_processing_queue(conversation_id) 
  WHERE status = 'pending';

-- New: at most 1 processing per conversation
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_queue_processing_conversation 
  ON public.ai_processing_queue(conversation_id) 
  WHERE status = 'processing';