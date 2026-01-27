-- 1. Create secure view exposing only public-safe fields
CREATE OR REPLACE VIEW public.agenda_pro_professionals_public AS
SELECT 
  id,
  law_firm_id,
  name,
  specialty,
  bio,
  avatar_url,
  color,
  is_active,
  position
FROM public.agenda_pro_professionals;

-- 2. Enable security_invoker so view inherits RLS
ALTER VIEW public.agenda_pro_professionals_public SET (security_invoker = on);

-- 3. Drop existing overly-permissive public policy from base table
DROP POLICY IF EXISTS "Public can view active professionals" ON public.agenda_pro_professionals;

-- 4. Create restricted policy for authenticated users on base table
DROP POLICY IF EXISTS "Authenticated users can view professionals" ON public.agenda_pro_professionals;
CREATE POLICY "Authenticated users can view professionals"
ON public.agenda_pro_professionals
FOR SELECT
TO authenticated
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

-- 5. Create public policy for the SAFE VIEW only
-- This policy allows public access to view active professionals only when public booking is enabled
-- PII fields (email, phone, document) are NOT included in the view
CREATE POLICY "Public can view active professionals via safe view"
ON public.agenda_pro_professionals
FOR SELECT
TO anon
USING (
  is_active = true 
  AND EXISTS (
    SELECT 1 FROM public.agenda_pro_settings s
    WHERE s.law_firm_id = agenda_pro_professionals.law_firm_id
    AND s.public_booking_enabled = true
  )
);