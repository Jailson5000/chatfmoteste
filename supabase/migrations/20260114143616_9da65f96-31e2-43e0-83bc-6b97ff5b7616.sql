-- Update the RLS policy to allow public read access to payments_disabled key
DROP POLICY IF EXISTS "Allow public read for payment provider" ON public.system_settings;

CREATE POLICY "Allow public read for payment settings" 
ON public.system_settings 
FOR SELECT 
USING (key IN ('payment_provider', 'payments_disabled'));