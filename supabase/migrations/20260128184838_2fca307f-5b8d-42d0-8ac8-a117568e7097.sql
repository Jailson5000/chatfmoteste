-- Revert the overly permissive policy
DROP POLICY IF EXISTS "Allow public subdomain availability check" ON public.law_firms;
DROP POLICY IF EXISTS "Authenticated users can view their own law firm details" ON public.law_firms;

-- Restore the original restrictive policies
CREATE POLICY "Users can view their own law firm"
ON public.law_firms
FOR SELECT
TO authenticated
USING (
  id = get_user_law_firm_id(auth.uid())
  OR is_admin(auth.uid())
);

-- Create a secure function for subdomain availability check
-- This function runs with elevated privileges but only returns a boolean
CREATE OR REPLACE FUNCTION public.is_subdomain_available(_subdomain text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.law_firms WHERE subdomain = lower(_subdomain)
  )
$$;