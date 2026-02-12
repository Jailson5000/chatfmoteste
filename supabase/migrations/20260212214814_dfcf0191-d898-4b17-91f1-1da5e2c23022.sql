
-- Fix: Replace overly broad public confirmation policy with a secure RPC approach
-- The old policy allows anon to UPDATE any row where confirmation_token IS NOT NULL
-- This is dangerous because it exposes client data and allows arbitrary updates

-- Drop the overly permissive public update policy
DROP POLICY IF EXISTS "Allow public confirmation via token" ON public.agenda_pro_appointments;

-- Create a secure RPC function for public appointment confirmation
-- This only confirms the appointment and returns minimal data
CREATE OR REPLACE FUNCTION public.confirm_appointment_by_token(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _appointment record;
BEGIN
  -- Find appointment by token
  SELECT id, status, confirmed_at INTO _appointment
  FROM public.agenda_pro_appointments
  WHERE confirmation_token = _token;
  
  IF _appointment IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token inválido ou agendamento não encontrado');
  END IF;
  
  IF _appointment.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Agendamento já confirmado anteriormente');
  END IF;
  
  IF _appointment.status NOT IN ('scheduled', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agendamento não pode ser confirmado no estado atual');
  END IF;
  
  -- Update only the confirmation fields
  UPDATE public.agenda_pro_appointments
  SET 
    confirmed_at = now(),
    confirmed_by = 'client',
    confirmed_via = 'link',
    status = 'confirmed'
  WHERE confirmation_token = _token
    AND confirmed_at IS NULL;
  
  RETURN jsonb_build_object('success', true, 'message', 'Agendamento confirmado com sucesso');
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.confirm_appointment_by_token(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.confirm_appointment_by_token(uuid) TO authenticated;
