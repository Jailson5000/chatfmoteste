-- Fix: Make chat-media bucket private and add tenant-scoped RLS

-- 1. Update bucket to private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'chat-media';

-- 2. Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can view chat media" ON storage.objects;

-- 3. Create tenant-scoped read policy
CREATE POLICY "Users can view chat media from their law firm"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-media'
  AND auth.uid() IS NOT NULL
  AND (
    -- Check if file belongs to user's law firm conversations
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.profiles p ON p.law_firm_id = c.law_firm_id
      WHERE c.id::text = (storage.foldername(name))[1]
      AND p.id = auth.uid()
    )
  )
);

-- 4. Update upload policy to be more restrictive (tenant-scoped)
DROP POLICY IF EXISTS "Authenticated users can upload chat media" ON storage.objects;

CREATE POLICY "Users can upload chat media to their conversations"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-media'
  AND auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.profiles p ON p.law_firm_id = c.law_firm_id
      WHERE c.id::text = (storage.foldername(name))[1]
      AND p.id = auth.uid()
    )
  )
);

-- 5. Add delete policy (users can delete their own uploads)
DROP POLICY IF EXISTS "Users can delete chat media" ON storage.objects;

CREATE POLICY "Users can delete chat media from their law firm"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'chat-media'
  AND auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.profiles p ON p.law_firm_id = c.law_firm_id
      WHERE c.id::text = (storage.foldername(name))[1]
      AND p.id = auth.uid()
    )
  )
);