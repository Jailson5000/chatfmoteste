-- Fix overly permissive RLS policy on law_firms table
-- Drop the overly permissive policy that exposes all law firm data
DROP POLICY IF EXISTS "Allow public subdomain lookup" ON public.law_firms;

-- Create a restricted policy that only allows public access to subdomain lookups via the function
-- Authenticated users can only see their own law firm
CREATE POLICY "Users can view their own law firm"
ON public.law_firms 
FOR SELECT
USING (
  -- Authenticated users can see their own law firm
  (auth.uid() IS NOT NULL AND id = get_user_law_firm_id(auth.uid()))
  OR
  -- Global admins can see all law firms
  is_admin(auth.uid())
);

-- Note: Public subdomain lookup is still available via get_law_firm_by_subdomain() function
-- which only returns the ID, not sensitive data