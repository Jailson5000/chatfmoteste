-- Create chat-media bucket for WhatsApp Cloud media downloads
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: Allow authenticated users to read files from their tenant folder
CREATE POLICY "Tenant members can read chat media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-media'
  AND auth.role() = 'authenticated'
  AND public.user_has_conversation_access(
    (storage.foldername(name))[1],
    auth.uid()
  )
);

-- RLS: Allow service role uploads (edge functions use service_role)
CREATE POLICY "Service role can upload chat media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-media'
);

-- Public read for chat-media (since bucket is public)
CREATE POLICY "Public read for chat media"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');