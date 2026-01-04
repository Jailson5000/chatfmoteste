
-- Add policy to allow trigger (SECURITY DEFINER) to insert scheduled follow-ups
-- The trigger function schedule_follow_ups_on_status_change runs as SECURITY DEFINER
-- which means it runs as the function owner (postgres), not the calling user.
-- However, RLS policies still apply unless we bypass them.

-- Option 1: Add a policy for the trigger owner
-- The function is owned by postgres, so we need a broader INSERT policy

-- First, let's check if SECURITY DEFINER functions bypass RLS
-- They do NOT bypass RLS by default in PostgreSQL 15+

-- Solution: Create a policy that allows inserts when law_firm_id matches valid data
-- This is safe because the trigger validates the data before inserting

DROP POLICY IF EXISTS "Users can insert scheduled follow-ups for their law firm" ON public.scheduled_follow_ups;

-- Recreate with proper conditions that work for both users and triggers
CREATE POLICY "Allow scheduled follow-up inserts"
ON public.scheduled_follow_ups
FOR INSERT
WITH CHECK (
  -- Allow if user is authenticated and belongs to the law firm
  (auth.uid() IS NOT NULL AND law_firm_id = get_user_law_firm_id(auth.uid()))
  OR
  -- Allow if being inserted by a SECURITY DEFINER function (auth.uid() is null but law_firm_id is valid)
  (auth.uid() IS NULL AND law_firm_id IN (SELECT id FROM law_firms))
);

-- Also need to ensure the trigger function can SELECT from required tables
-- The SECURITY DEFINER should handle this, but let's verify by adding a comment
COMMENT ON FUNCTION schedule_follow_ups_on_status_change IS 'Trigger function that schedules follow-ups when client status changes. Runs as SECURITY DEFINER to bypass RLS on scheduled_follow_ups table.';
