-- Create a SECURITY DEFINER function to safely return professionals for public booking
-- This function validates that public booking is enabled and returns only safe public data

CREATE OR REPLACE FUNCTION public.get_public_professionals_for_booking(_law_firm_id uuid, _service_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  specialty text,
  avatar_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate that public booking is enabled for this law firm
  IF NOT EXISTS (
    SELECT 1 FROM public.agenda_pro_settings
    WHERE law_firm_id = _law_firm_id
    AND is_enabled = true
    AND public_booking_enabled = true
  ) THEN
    -- Return empty if public booking is not enabled
    RETURN;
  END IF;

  -- If service_id is provided, return only professionals linked to that service
  IF _service_id IS NOT NULL THEN
    -- First validate the service is public and active
    IF NOT EXISTS (
      SELECT 1 FROM public.agenda_pro_services
      WHERE id = _service_id
      AND law_firm_id = _law_firm_id
      AND is_active = true
      AND is_public = true
    ) THEN
      RETURN;
    END IF;

    -- Return professionals linked to this service
    RETURN QUERY
    SELECT 
      p.id,
      p.name,
      p.specialty,
      p.avatar_url
    FROM public.agenda_pro_professionals p
    INNER JOIN public.agenda_pro_service_professionals sp ON sp.professional_id = p.id
    WHERE sp.service_id = _service_id
      AND p.law_firm_id = _law_firm_id
      AND p.is_active = true
    ORDER BY p.position NULLS LAST, p.name;
  ELSE
    -- Return all active professionals for the law firm
    RETURN QUERY
    SELECT 
      p.id,
      p.name,
      p.specialty,
      p.avatar_url
    FROM public.agenda_pro_professionals p
    WHERE p.law_firm_id = _law_firm_id
      AND p.is_active = true
    ORDER BY p.position NULLS LAST, p.name;
  END IF;
END;
$$;

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.get_public_professionals_for_booking(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_professionals_for_booking(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_public_professionals_for_booking IS 
'Safely returns professionals for public booking. Only returns data if public booking is enabled for the tenant.
Returns only safe public data (id, name, specialty, avatar_url) - no PII like email/phone/document.';