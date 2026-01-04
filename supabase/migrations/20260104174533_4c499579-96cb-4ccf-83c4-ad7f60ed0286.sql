
-- Drop and recreate the SELECT policy on status_follow_ups to allow trigger access
DROP POLICY IF EXISTS "Users can view follow-ups of their law firm" ON public.status_follow_ups;
DROP POLICY IF EXISTS "Allow postgres to read follow-ups" ON public.status_follow_ups;

CREATE POLICY "Allow follow-ups read for users and triggers"
ON public.status_follow_ups
FOR SELECT
USING (
  -- Allow authenticated users from same law firm
  (auth.uid() IS NOT NULL AND law_firm_id = get_user_law_firm_id(auth.uid()))
  OR
  -- Allow trigger context (no authenticated user)
  (auth.uid() IS NULL)
);

-- Same for conversations
DROP POLICY IF EXISTS "Allow postgres to read conversations" ON public.conversations;

-- Check current policies
SELECT polname FROM pg_policy WHERE polrelid = 'public.conversations'::regclass AND polcmd = 'r';
