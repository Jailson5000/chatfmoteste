-- Add RLS policy to allow global admins to manage law_firm_settings for any company
CREATE POLICY "Global admins can manage all law firm settings" 
ON public.law_firm_settings 
FOR ALL 
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));