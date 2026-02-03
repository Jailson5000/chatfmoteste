-- =============================================================================
-- RPC: create_public_booking_appointment (UPDATED)
-- Agora verifica disponibilidade de horário ao selecionar profissional automaticamente
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_public_booking_appointment(
  _public_slug text,
  _service_id uuid,
  _start_time timestamptz,
  _client_name text,
  _client_phone text,
  _professional_id uuid DEFAULT NULL,
  _client_email text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _law_firm_id uuid;
  _service record;
  _professional record;
  _end_time timestamptz;
  _duration_minutes integer;
  _appointment_id uuid;
  _confirmation_token uuid;
BEGIN
  -- 1. Resolve law_firm_id from public_slug and validate booking is enabled
  SELECT law_firm_id INTO _law_firm_id
  FROM public.agenda_pro_settings aps
  WHERE aps.public_slug = _public_slug
    AND aps.is_enabled = true
    AND aps.public_booking_enabled = true;

  IF _law_firm_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Agenda não encontrada ou agendamento online não habilitado'
    );
  END IF;

  -- 2. Validate service belongs to tenant, is active and public
  SELECT s.id, s.duration_minutes, s.name
  INTO _service
  FROM public.agenda_pro_services s
  WHERE s.id = _service_id
    AND s.law_firm_id = _law_firm_id
    AND s.is_active = true
    AND s.is_public = true;

  IF _service IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Serviço não encontrado ou não disponível para agendamento online'
    );
  END IF;

  _duration_minutes := _service.duration_minutes;
  _end_time := _start_time + (_duration_minutes || ' minutes')::interval;

  -- 3. Validate or select professional
  IF _professional_id IS NOT NULL THEN
    -- Validate provided professional belongs to tenant, is active, and linked to service
    SELECT p.id, p.name
    INTO _professional
    FROM public.agenda_pro_professionals p
    INNER JOIN public.agenda_pro_service_professionals sp ON sp.professional_id = p.id
    WHERE p.id = _professional_id
      AND p.law_firm_id = _law_firm_id
      AND p.is_active = true
      AND sp.service_id = _service_id;

    IF _professional IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Profissional não disponível para este serviço'
      );
    END IF;
    
    -- Check if selected professional has a conflict
    IF EXISTS (
      SELECT 1 FROM public.agenda_pro_appointments apt
      WHERE apt.professional_id = _professional_id
        AND apt.status NOT IN ('cancelled', 'no_show')
        AND apt.start_time < _end_time
        AND apt.end_time > _start_time
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'O profissional selecionado já possui agendamento neste horário'
      );
    END IF;
  ELSE
    -- Select first AVAILABLE professional linked to the service (no time conflict)
    SELECT p.id, p.name
    INTO _professional
    FROM public.agenda_pro_professionals p
    INNER JOIN public.agenda_pro_service_professionals sp ON sp.professional_id = p.id
    WHERE p.law_firm_id = _law_firm_id
      AND p.is_active = true
      AND sp.service_id = _service_id
      -- Exclude professionals with time conflicts
      AND NOT EXISTS (
        SELECT 1 FROM public.agenda_pro_appointments apt
        WHERE apt.professional_id = p.id
          AND apt.status NOT IN ('cancelled', 'no_show')
          AND apt.start_time < _end_time
          AND apt.end_time > _start_time
      )
    ORDER BY p.position NULLS LAST, p.name
    LIMIT 1;

    IF _professional IS NULL THEN
      -- Check if there are any professionals for the service at all
      IF EXISTS (
        SELECT 1 FROM public.agenda_pro_professionals p
        INNER JOIN public.agenda_pro_service_professionals sp ON sp.professional_id = p.id
        WHERE p.law_firm_id = _law_firm_id
          AND p.is_active = true
          AND sp.service_id = _service_id
      ) THEN
        -- Professionals exist but all are busy
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Nenhum profissional disponível neste horário'
        );
      ELSE
        -- No professionals linked to service
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Nenhum profissional disponível para este serviço'
        );
      END IF;
    END IF;
  END IF;

  -- 4. Insert appointment
  INSERT INTO public.agenda_pro_appointments (
    law_firm_id,
    service_id,
    professional_id,
    client_name,
    client_phone,
    client_email,
    start_time,
    end_time,
    duration_minutes,
    notes,
    source,
    status
  ) VALUES (
    _law_firm_id,
    _service_id,
    _professional.id,
    _client_name,
    _client_phone,
    NULLIF(trim(_client_email), ''),
    _start_time,
    _end_time,
    _duration_minutes,
    NULLIF(trim(_notes), ''),
    'public_booking',
    'scheduled'
  )
  RETURNING id, confirmation_token INTO _appointment_id, _confirmation_token;

  -- 5. Return success with appointment data
  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', _appointment_id,
    'confirmation_token', _confirmation_token,
    'professional_id', _professional.id,
    'professional_name', _professional.name,
    'service_name', _service.name,
    'start_time', _start_time,
    'end_time', _end_time
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Erro ao criar agendamento: ' || SQLERRM
  );
END;
$function$;

COMMENT ON FUNCTION public.create_public_booking_appointment IS 'Secure RPC for public booking - validates tenant via slug, enforces service/professional rules, checks availability, and creates appointment with proper isolation';