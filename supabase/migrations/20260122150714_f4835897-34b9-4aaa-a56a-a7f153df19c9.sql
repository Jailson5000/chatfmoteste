-- Fix RLS policy for internal-chat-files to allow access by conversation_id folder (legacy files)
-- and also by law_firm_id folder (new format)

-- Drop existing policies to recreate them with broader matching
DROP POLICY IF EXISTS "Team members can upload internal files to tenant folder" ON storage.objects;
DROP POLICY IF EXISTS "Team members can view internal files from tenant folder" ON storage.objects;
DROP POLICY IF EXISTS "Team members can delete internal files from tenant folder" ON storage.objects;
DROP POLICY IF EXISTS "Team members can upload internal files" ON storage.objects;
DROP POLICY IF EXISTS "Team members can access internal files" ON storage.objects;

-- Create helper function to check if user has access to a conversation
CREATE OR REPLACE FUNCTION public.user_has_conversation_access(folder_name text, user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_law_firm uuid;
BEGIN
  -- Get user's law firm
  SELECT law_firm_id INTO user_law_firm FROM profiles WHERE id = user_id;
  IF user_law_firm IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if folder is the law_firm_id itself (new format)
  IF folder_name::uuid = user_law_firm THEN
    RETURN true;
  END IF;
  
  -- Check if folder is a conversation_id that belongs to user's law firm (legacy format)
  RETURN EXISTS (
    SELECT 1 FROM conversations 
    WHERE id::text = folder_name 
    AND law_firm_id = user_law_firm
  );
EXCEPTION
  WHEN others THEN
    RETURN false;
END;
$$;

-- Upload policy: allows uploading to tenant folder or conversation folder
CREATE POLICY "Team members can upload internal files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'internal-chat-files' 
  AND user_has_conversation_access((storage.foldername(name))[1], auth.uid())
);

-- Read policy: allows reading from tenant folder or conversation folder
CREATE POLICY "Team members can view internal files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'internal-chat-files' 
  AND user_has_conversation_access((storage.foldername(name))[1], auth.uid())
);

-- Delete policy: allows deleting from tenant folder or conversation folder
CREATE POLICY "Team members can delete internal files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'internal-chat-files' 
  AND user_has_conversation_access((storage.foldername(name))[1], auth.uid())
);