-- Fix ai_transfer_logs RLS policies to apply to authenticated users
-- The current policies use role "public" which may not work correctly

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Users can view transfer logs in their law firm" ON public.ai_transfer_logs;
DROP POLICY IF EXISTS "Global admins can view all transfer logs" ON public.ai_transfer_logs;

-- Recreate with authenticated role
CREATE POLICY "Users can view transfer logs in their law firm" 
ON public.ai_transfer_logs 
FOR SELECT 
TO authenticated
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Global admins can view all transfer logs" 
ON public.ai_transfer_logs 
FOR SELECT 
TO authenticated
USING (is_admin(auth.uid()));