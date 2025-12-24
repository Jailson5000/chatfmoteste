-- Create bucket for template media files
INSERT INTO storage.buckets (id, name, public)
VALUES ('template-media', 'template-media', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow authenticated users to upload template media
CREATE POLICY "Authenticated users can upload template media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'template-media');

-- Policy to allow public read access to template media
CREATE POLICY "Public can view template media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'template-media');

-- Policy to allow users to update their uploads
CREATE POLICY "Users can update their template media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'template-media');

-- Policy to allow users to delete their uploads
CREATE POLICY "Users can delete their template media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'template-media');