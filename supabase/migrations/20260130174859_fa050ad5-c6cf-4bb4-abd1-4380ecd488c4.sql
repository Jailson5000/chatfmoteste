-- Fix the ambiguous column reference "id" in the function
-- The issue: RETURNS TABLE (id uuid, ...) creates OUT variables that conflict with table columns

CREATE OR REPLACE FUNCTION public.get_public_professionals_for_booking(_law_firm_id uuid, _service_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, specialty text, avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate that public booking is enabled for this law firm
  IF NOT EXISTS (
    SELECT 1 FROM public.agenda_pro_settings aps
    WHERE aps.law_firm_id = _law_firm_id
    AND aps.is_enabled = true
    AND aps.public_booking_enabled = true
  ) THEN
    -- Return empty if public booking is not enabled
    RETURN;
  END IF;

  -- If service_id is provided, return only professionals linked to that service
  IF _service_id IS NOT NULL THEN
    -- First validate the service is public and active
    -- Using alias 's' to avoid conflict with OUT variable 'id'
    IF NOT EXISTS (
      SELECT 1 FROM public.agenda_pro_services s
      WHERE s.id = _service_id
      AND s.law_firm_id = _law_firm_id
      AND s.is_active = true
      AND s.is_public = true
    ) THEN
      RETURN;
    END IF;

    -- Return professionals linked to this service
    -- Using aliases to avoid any ambiguity: p for professionals, sp for service_professionals
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
$function$;

-- Ensure anon and authenticated can execute this function
GRANT EXECUTE ON FUNCTION public.get_public_professionals_for_booking(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_professionals_for_booking(uuid, uuid) TO authenticated;