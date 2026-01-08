-- Add INSERT policy for ai_transfer_logs so authenticated users can log transfers
-- This is needed because the frontend performs transfers and needs to log them

CREATE POLICY "Authenticated users can insert transfer logs in their law firm" 
ON public.ai_transfer_logs 
FOR INSERT 
TO authenticated
WITH CHECK (law_firm_id = get_user_law_firm_id(auth.uid()));