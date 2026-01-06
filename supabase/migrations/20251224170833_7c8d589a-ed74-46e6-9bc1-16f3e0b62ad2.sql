-- Drop existing RLS policies on law_firms table
DROP POLICY IF EXISTS "Users can view their law firm" ON public.law_firms;

-- Create more secure RLS policy with explicit auth.uid() check
CREATE POLICY "Users can view their law firm"
ON public.law_firms FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND id = get_user_law_firm_id(auth.uid())
);