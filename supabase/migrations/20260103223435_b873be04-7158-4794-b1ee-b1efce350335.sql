-- Fix clients table RLS policies to add failsafe against NULL law_firm_id
-- Drop existing policies
DROP POLICY IF EXISTS "Users can delete clients in their law firm" ON public.clients;
DROP POLICY IF EXISTS "Users can insert clients in their law firm" ON public.clients;
DROP POLICY IF EXISTS "Users can update clients in their law firm" ON public.clients;
DROP POLICY IF EXISTS "Users can view clients in their law firm" ON public.clients;

-- Recreate policies with explicit NULL checks for both auth.uid() AND get_user_law_firm_id()
CREATE POLICY "Users can view clients in their law firm" 
ON public.clients 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND get_user_law_firm_id(auth.uid()) IS NOT NULL
  AND law_firm_id = get_user_law_firm_id(auth.uid())
);

CREATE POLICY "Users can insert clients in their law firm" 
ON public.clients 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND get_user_law_firm_id(auth.uid()) IS NOT NULL
  AND law_firm_id = get_user_law_firm_id(auth.uid())
);

CREATE POLICY "Users can update clients in their law firm" 
ON public.clients 
FOR UPDATE 
USING (
  auth.uid() IS NOT NULL 
  AND get_user_law_firm_id(auth.uid()) IS NOT NULL
  AND law_firm_id = get_user_law_firm_id(auth.uid())
);

CREATE POLICY "Users can delete clients in their law firm" 
ON public.clients 
FOR DELETE 
USING (
  auth.uid() IS NOT NULL 
  AND get_user_law_firm_id(auth.uid()) IS NOT NULL
  AND law_firm_id = get_user_law_firm_id(auth.uid())
);

-- Also add global admin access for monitoring/support purposes
CREATE POLICY "Global admins can view all clients" 
ON public.clients 
FOR SELECT 
USING (is_admin(auth.uid()));