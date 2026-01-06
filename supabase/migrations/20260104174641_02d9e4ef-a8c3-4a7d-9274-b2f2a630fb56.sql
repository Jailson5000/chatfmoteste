
-- Re-enable RLS on scheduled_follow_ups but with a bypass policy for system operations
ALTER TABLE public.scheduled_follow_ups ENABLE ROW LEVEL SECURITY;

-- Drop existing policies and recreate with proper bypass
DROP POLICY IF EXISTS "Allow scheduled follow-up inserts" ON public.scheduled_follow_ups;
DROP POLICY IF EXISTS "Allow all for postgres role" ON public.scheduled_follow_ups;
DROP POLICY IF EXISTS "Users can view scheduled follow-ups of their law firm" ON public.scheduled_follow_ups;
DROP POLICY IF EXISTS "Users can update scheduled follow-ups of their law firm" ON public.scheduled_follow_ups;
DROP POLICY IF EXISTS "Users can delete scheduled follow-ups of their law firm" ON public.scheduled_follow_ups;

-- Create unified policies that work for both users and triggers
CREATE POLICY "scheduled_follow_ups_select"
ON public.scheduled_follow_ups FOR SELECT
USING (
  law_firm_id = get_user_law_firm_id(auth.uid())
  OR auth.uid() IS NULL  -- Allow trigger context
);

CREATE POLICY "scheduled_follow_ups_insert"
ON public.scheduled_follow_ups FOR INSERT
WITH CHECK (
  law_firm_id = get_user_law_firm_id(auth.uid())
  OR auth.uid() IS NULL  -- Allow trigger context
);

CREATE POLICY "scheduled_follow_ups_update"
ON public.scheduled_follow_ups FOR UPDATE
USING (
  law_firm_id = get_user_law_firm_id(auth.uid())
  OR auth.uid() IS NULL  -- Allow trigger context
);

CREATE POLICY "scheduled_follow_ups_delete"
ON public.scheduled_follow_ups FOR DELETE
USING (
  law_firm_id = get_user_law_firm_id(auth.uid())
  OR auth.uid() IS NULL  -- Allow trigger context
);
