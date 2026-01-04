
-- Update conversations policy to allow trigger access as well
DROP POLICY IF EXISTS "Users can view conversations in their law firm" ON public.conversations;

CREATE POLICY "Allow conversations read for users and triggers"
ON public.conversations
FOR SELECT
USING (
  -- Allow authenticated users from same law firm
  (auth.uid() IS NOT NULL AND law_firm_id = get_user_law_firm_id(auth.uid()))
  OR
  -- Allow global admins
  is_admin(auth.uid())
  OR
  -- Allow trigger context (no authenticated user)
  (auth.uid() IS NULL)
);

-- Keep global admin policy intact
-- It already exists as "Global admins can view all conversations"
