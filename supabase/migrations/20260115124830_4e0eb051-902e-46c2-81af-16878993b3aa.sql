-- Drop the existing policy for payment settings
DROP POLICY IF EXISTS "Allow public read for payment settings" ON public.system_settings;

-- Create updated policy to include manual_registration_enabled
CREATE POLICY "Allow public read for payment and registration settings" 
ON public.system_settings 
FOR SELECT 
USING (key IN ('payment_provider', 'payments_disabled', 'manual_registration_enabled'));