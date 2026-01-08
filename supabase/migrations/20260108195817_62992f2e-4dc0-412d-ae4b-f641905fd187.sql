-- Fix agent_folders INSERT policy to validate law_firm_id on insert
DROP POLICY IF EXISTS "Users can create folders for their law firm" ON public.agent_folders;

CREATE POLICY "Users can create folders for their law firm"
ON public.agent_folders
FOR INSERT
TO public
WITH CHECK (law_firm_id = get_user_law_firm_id(auth.uid()));