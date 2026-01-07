-- Allow public (including unauthenticated users) to read ONLY the payment provider setting
-- This is needed for the public checkout modal to decide between Stripe vs ASAAS.

DROP POLICY IF EXISTS "Public can read payment provider" ON public.system_settings;

CREATE POLICY "Public can read payment provider"
ON public.system_settings
FOR SELECT
USING (key = 'payment_provider');
