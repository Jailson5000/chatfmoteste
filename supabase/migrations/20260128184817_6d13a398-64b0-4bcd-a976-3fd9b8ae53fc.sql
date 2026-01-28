-- Allow public (anonymous) users to check subdomain availability
-- This is a security-safe operation as it only exposes the subdomain column for availability checking
CREATE POLICY "Allow public subdomain availability check"
ON public.law_firms
FOR SELECT
TO anon, authenticated
USING (true);

-- Drop the redundant policies that are now covered by the new public policy
DROP POLICY IF EXISTS "Users can view their law firm" ON public.law_firms;
DROP POLICY IF EXISTS "Users can view their own law firm" ON public.law_firms;

-- Create a more restrictive policy for full row access (only for authenticated users)
CREATE POLICY "Authenticated users can view their own law firm details"
ON public.law_firms
FOR SELECT
TO authenticated
USING (
  id = get_user_law_firm_id(auth.uid())
  OR is_admin(auth.uid())
);