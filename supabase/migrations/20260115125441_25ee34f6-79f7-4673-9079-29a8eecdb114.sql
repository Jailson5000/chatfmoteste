-- Allow public read access to active plans for registration page
CREATE POLICY "Allow public read for active plans" 
ON public.plans 
FOR SELECT 
USING (is_active = true);