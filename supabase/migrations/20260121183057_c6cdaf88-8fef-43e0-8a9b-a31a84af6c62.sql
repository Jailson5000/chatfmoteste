
-- =====================================================
-- SECURITY FIX: Additional tenant validation
-- =====================================================

-- 1. Fix update_client_status_with_follow_ups - add tenant validation
CREATE OR REPLACE FUNCTION public.update_client_status_with_follow_ups(
  _client_id uuid, 
  _new_status_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_status_id uuid;
  _client_law_firm_id uuid;
  _conversation_id uuid;
  _follow_up record;
  _delay_minutes integer;
  _insert_count integer := 0;
  _caller_law_firm_id uuid;
BEGIN
  -- SECURITY: Get caller's law_firm_id
  _caller_law_firm_id := get_user_law_firm_id(auth.uid());
  IF _caller_law_firm_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Get current status and law_firm_id
  SELECT custom_status_id, law_firm_id INTO _old_status_id, _client_law_firm_id 
  FROM public.clients WHERE id = _client_id;
  
  IF _client_law_firm_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;

  -- SECURITY: Validate caller belongs to the client's law_firm
  IF _client_law_firm_id <> _caller_law_firm_id AND NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  -- Get conversation ID (most recent, even if archived)
  SELECT id INTO _conversation_id
  FROM public.conversations
  WHERE client_id = _client_id AND law_firm_id = _client_law_firm_id
  ORDER BY last_message_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  -- Update the client status
  UPDATE public.clients SET custom_status_id = _new_status_id WHERE id = _client_id;

  -- If status didn't change or new status null, just cancel follow-ups and return
  IF NOT (_old_status_id IS DISTINCT FROM _new_status_id) THEN
    RETURN jsonb_build_object('success', true, 'message', 'Status unchanged');
  END IF;

  -- Cancel pending/processing follow-ups
  UPDATE public.scheduled_follow_ups
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Status changed'
  WHERE client_id = _client_id AND status IN ('pending', 'processing');

  IF _new_status_id IS NULL OR _conversation_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'old_status', _old_status_id,
      'new_status', _new_status_id,
      'conversation_id', _conversation_id,
      'follow_ups_created', 0
    );
  END IF;

  -- Schedule new follow-ups
  FOR _follow_up IN
    SELECT * FROM public.status_follow_ups
    WHERE status_id = _new_status_id AND is_active = true
    ORDER BY position ASC
  LOOP
    _delay_minutes := CASE _follow_up.delay_unit
      WHEN 'hour' THEN _follow_up.delay_minutes * 60
      WHEN 'day' THEN _follow_up.delay_minutes * 60 * 24
      ELSE _follow_up.delay_minutes
    END;
    
    INSERT INTO public.scheduled_follow_ups (
      law_firm_id, client_id, conversation_id, follow_up_rule_id, template_id, scheduled_at, status
    ) VALUES (
      _client_law_firm_id, _client_id, _conversation_id, _follow_up.id, _follow_up.template_id,
      now() + (_delay_minutes || ' minutes')::interval, 'pending'
    );
    
    _insert_count := _insert_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'old_status', _old_status_id,
    'new_status', _new_status_id,
    'conversation_id', _conversation_id,
    'follow_ups_created', _insert_count
  );
END;
$$;

-- 2. Fix reassociate_orphan_records - add tenant validation
CREATE OR REPLACE FUNCTION public.reassociate_orphan_records(_instance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clients_updated integer := 0;
  _conversations_updated integer := 0;
  _instance_law_firm_id uuid;
  _caller_law_firm_id uuid;
BEGIN
  -- SECURITY: Get caller's law_firm_id
  _caller_law_firm_id := get_user_law_firm_id(auth.uid());
  IF _caller_law_firm_id IS NULL AND NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Get instance's law_firm_id
  SELECT law_firm_id INTO _instance_law_firm_id 
  FROM public.whatsapp_instances 
  WHERE id = _instance_id;
  
  IF _instance_law_firm_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Instance not found');
  END IF;

  -- SECURITY: Validate caller belongs to the instance's law_firm or is global admin
  IF _instance_law_firm_id <> _caller_law_firm_id AND NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  -- Reassociate orphan clients (only within the same tenant)
  UPDATE public.clients
  SET 
    whatsapp_instance_id = _instance_id,
    last_whatsapp_instance_id = NULL,
    updated_at = now()
  WHERE last_whatsapp_instance_id = _instance_id
    AND whatsapp_instance_id IS NULL
    AND law_firm_id = _instance_law_firm_id;
  
  GET DIAGNOSTICS _clients_updated = ROW_COUNT;

  -- Reassociate orphan conversations (only within the same tenant)
  UPDATE public.conversations
  SET 
    whatsapp_instance_id = _instance_id,
    last_whatsapp_instance_id = NULL,
    updated_at = now()
  WHERE last_whatsapp_instance_id = _instance_id
    AND whatsapp_instance_id IS NULL
    AND law_firm_id = _instance_law_firm_id;
  
  GET DIAGNOSTICS _conversations_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'clients_reassociated', _clients_updated,
    'conversations_reassociated', _conversations_updated
  );
END;
$$;
