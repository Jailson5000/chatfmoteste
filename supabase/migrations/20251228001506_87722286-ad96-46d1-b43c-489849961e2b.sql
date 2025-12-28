-- Add is_internal column to messages for internal team conversations
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;

-- Add index for filtering internal messages
CREATE INDEX IF NOT EXISTS idx_messages_is_internal ON public.messages(conversation_id, is_internal);

-- Create storage bucket for internal chat files (private - only team can access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('internal-chat-files', 'internal-chat-files', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for internal chat files bucket
CREATE POLICY "Team members can upload internal files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'internal-chat-files' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Team members can view internal files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'internal-chat-files' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Team members can delete their own internal files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'internal-chat-files' 
  AND auth.uid() IS NOT NULL
);