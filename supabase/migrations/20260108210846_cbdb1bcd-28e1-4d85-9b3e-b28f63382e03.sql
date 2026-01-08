-- Create table to track pending AI processing with debounce
CREATE TABLE IF NOT EXISTS public.ai_processing_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]', -- Array of message contents to process together
  message_count INTEGER NOT NULL DEFAULT 0,
  first_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  process_after TIMESTAMP WITH TIME ZONE NOT NULL, -- When to actually process (debounce time)
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  processing_started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to ensure only one pending queue item per conversation
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_queue_pending_conversation 
  ON public.ai_processing_queue(conversation_id) 
  WHERE status = 'pending';

-- Index for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_ai_queue_process_after 
  ON public.ai_processing_queue(process_after) 
  WHERE status = 'pending';

-- Index for law firm filtering
CREATE INDEX IF NOT EXISTS idx_ai_queue_law_firm 
  ON public.ai_processing_queue(law_firm_id);

-- Enable RLS
ALTER TABLE public.ai_processing_queue ENABLE ROW LEVEL SECURITY;

-- RLS policy for service role only (this is a backend-only table)
CREATE POLICY "Service role full access to ai_processing_queue"
  ON public.ai_processing_queue
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE public.ai_processing_queue IS 'Queue for batching multiple client messages before AI processing (debounce pattern)';