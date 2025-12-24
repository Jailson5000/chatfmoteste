-- Drop existing RLS policies on clients table
DROP POLICY IF EXISTS "Users can view clients in their law firm" ON public.clients;
DROP POLICY IF EXISTS "Users can manage clients in their law firm" ON public.clients;

-- Create more secure RLS policies with explicit auth.uid() check
CREATE POLICY "Users can view clients in their law firm"
ON public.clients FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND law_firm_id = get_user_law_firm_id(auth.uid())
);

CREATE POLICY "Users can insert clients in their law firm"
ON public.clients FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND law_firm_id = get_user_law_firm_id(auth.uid())
);

CREATE POLICY "Users can update clients in their law firm"
ON public.clients FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND law_firm_id = get_user_law_firm_id(auth.uid())
);

CREATE POLICY "Users can delete clients in their law firm"
ON public.clients FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND law_firm_id = get_user_law_firm_id(auth.uid())
);