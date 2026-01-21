-- Add UPDATE policy for companies table so users can update their own company settings
CREATE POLICY "Users can update their own company settings" 
ON public.companies 
FOR UPDATE 
USING (law_firm_id IN (
  SELECT profiles.law_firm_id 
  FROM profiles 
  WHERE profiles.id = auth.uid()
))
WITH CHECK (law_firm_id IN (
  SELECT profiles.law_firm_id 
  FROM profiles 
  WHERE profiles.id = auth.uid()
));