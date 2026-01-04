
-- The simplest and most reliable solution is to disable RLS on the scheduled_follow_ups table
-- for database operations (triggers) while keeping API-level security through RLS policies
-- that apply only when accessed through the authenticated/anon roles

-- Actually, let's try a different approach: use a service role bypass
-- We'll alter the table to allow the postgres role to bypass RLS

-- First, let's grant the postgres role explicit bypass
ALTER TABLE public.scheduled_follow_ups FORCE ROW LEVEL SECURITY;

-- Now create a policy that explicitly allows the postgres role to do anything
CREATE POLICY "Allow all for postgres role"
ON public.scheduled_follow_ups
FOR ALL
TO postgres
USING (true)
WITH CHECK (true);
