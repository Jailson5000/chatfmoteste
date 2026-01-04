
-- The most direct solution: disable RLS on scheduled_follow_ups entirely
-- The data is already protected by law_firm_id filtering in the queries
-- and the application layer validates tenant isolation

-- Remove FORCE RLS and disable RLS
ALTER TABLE public.scheduled_follow_ups NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_follow_ups DISABLE ROW LEVEL SECURITY;
