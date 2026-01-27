-- =============================================
-- FIX: Remove anon access to agenda_pro_professionals base table
-- Protect PII (email, phone, document) from public exposure
-- =============================================

-- Step 1: Drop the problematic anon policy from base table
DROP POLICY IF EXISTS "Public can view active professionals via safe view" 
ON public.agenda_pro_professionals;

-- Step 2: Recreate safe view with security_invoker (excludes PII columns)
CREATE OR REPLACE VIEW public.agenda_pro_professionals_public
WITH (security_invoker = on) AS
SELECT 
  id,
  law_firm_id,
  name,
  specialty,
  bio,
  avatar_url,
  color,
  is_active,
  position,
  created_at,
  updated_at
  -- EXCLUDES: email, phone, document, user_id, notify_new_appointment, notify_cancellation
FROM public.agenda_pro_professionals
WHERE is_active = true
  AND EXISTS (
    SELECT 1 FROM public.agenda_pro_settings s
    WHERE s.law_firm_id = agenda_pro_professionals.law_firm_id
    AND s.public_booking_enabled = true
  );

-- Step 3: Grant anon access ONLY to the safe view (not the base table)
GRANT SELECT ON public.agenda_pro_professionals_public TO anon;