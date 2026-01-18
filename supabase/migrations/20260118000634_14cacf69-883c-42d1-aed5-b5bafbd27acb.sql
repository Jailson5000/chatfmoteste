-- ===========================================================
-- SECURITY FIX 1: Tray Commerce Webhook Authentication
-- ===========================================================

-- Add webhook_secret column to tray_commerce_connections
ALTER TABLE public.tray_commerce_connections 
ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- Generate webhook secrets for existing connections
UPDATE public.tray_commerce_connections 
SET webhook_secret = encode(gen_random_bytes(32), 'hex')
WHERE webhook_secret IS NULL;

-- Make webhook_secret required for new connections
ALTER TABLE public.tray_commerce_connections 
ALTER COLUMN webhook_secret SET DEFAULT encode(gen_random_bytes(32), 'hex');

-- ===========================================================
-- SECURITY FIX 2: Storage Bucket Tenant Isolation
-- ===========================================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Users can upload chat media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their uploads" ON storage.objects;
DROP POLICY IF EXISTS "Team members can upload internal files" ON storage.objects;
DROP POLICY IF EXISTS "Team members can view internal files" ON storage.objects;
DROP POLICY IF EXISTS "Team members can delete their own internal files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload logos for their law firm" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload template media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their template media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their template media" ON storage.objects;

-- ===========================================================
-- CHAT-MEDIA BUCKET (public read, tenant-isolated write)
-- Path structure: {law_firm_id}/{filename}
-- ===========================================================

-- Upload: only to own tenant folder
CREATE POLICY "Users can upload chat media to tenant folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-media' 
  AND (storage.foldername(name))[1] = get_user_law_firm_id(auth.uid())::text
);

-- Delete: only own tenant files
CREATE POLICY "Users can delete chat media from tenant folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-media' 
  AND (storage.foldername(name))[1] = get_user_law_firm_id(auth.uid())::text
);

-- Public read remains unchanged (Anyone can view chat media already exists)

-- ===========================================================
-- INTERNAL-CHAT-FILES BUCKET (private, tenant-isolated)
-- Path structure: {law_firm_id}/{filename}
-- ===========================================================

-- Upload: only to own tenant folder
CREATE POLICY "Team members can upload internal files to tenant folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'internal-chat-files' 
  AND (storage.foldername(name))[1] = get_user_law_firm_id(auth.uid())::text
);

-- Read: only own tenant files
CREATE POLICY "Team members can view internal files from tenant folder"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'internal-chat-files' 
  AND (storage.foldername(name))[1] = get_user_law_firm_id(auth.uid())::text
);

-- Delete: only own tenant files
CREATE POLICY "Team members can delete internal files from tenant folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'internal-chat-files' 
  AND (storage.foldername(name))[1] = get_user_law_firm_id(auth.uid())::text
);

-- ===========================================================
-- LOGOS BUCKET (public read, tenant-isolated write)
-- Path structure: {law_firm_id}/{filename}
-- ===========================================================

-- Upload: only to own tenant folder
CREATE POLICY "Users can upload logos to tenant folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos' 
  AND (storage.foldername(name))[1] = get_user_law_firm_id(auth.uid())::text
);

-- Update: only own tenant files
CREATE POLICY "Users can update logos in tenant folder"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos' 
  AND (storage.foldername(name))[1] = get_user_law_firm_id(auth.uid())::text
);

-- Delete: only own tenant files
CREATE POLICY "Users can delete logos from tenant folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos' 
  AND (storage.foldername(name))[1] = get_user_law_firm_id(auth.uid())::text
);

-- ===========================================================
-- TEMPLATE-MEDIA BUCKET (public read, tenant-isolated write)
-- Path structure: {law_firm_id}/{filename}
-- ===========================================================

-- Upload: only to own tenant folder
CREATE POLICY "Users can upload template media to tenant folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'template-media' 
  AND (storage.foldername(name))[1] = get_user_law_firm_id(auth.uid())::text
);

-- Update: only own tenant files
CREATE POLICY "Users can update template media in tenant folder"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'template-media' 
  AND (storage.foldername(name))[1] = get_user_law_firm_id(auth.uid())::text
);

-- Delete: only own tenant files
CREATE POLICY "Users can delete template media from tenant folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'template-media' 
  AND (storage.foldername(name))[1] = get_user_law_firm_id(auth.uid())::text
);

-- ===========================================================
-- ENCRYPTED-KEYS BUCKET (admin only, tenant-isolated)
-- Already has admin check, add tenant isolation
-- ===========================================================

DROP POLICY IF EXISTS "Admins can access encrypted keys" ON storage.objects;

CREATE POLICY "Admins can access encrypted keys in tenant folder"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'encrypted-keys' 
  AND has_role(auth.uid(), 'admin'::app_role)
  AND (storage.foldername(name))[1] = get_user_law_firm_id(auth.uid())::text
)
WITH CHECK (
  bucket_id = 'encrypted-keys' 
  AND has_role(auth.uid(), 'admin'::app_role)
  AND (storage.foldername(name))[1] = get_user_law_firm_id(auth.uid())::text
);