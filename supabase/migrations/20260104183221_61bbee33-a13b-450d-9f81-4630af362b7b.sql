
-- Simplificar a função para debug máximo
CREATE OR REPLACE FUNCTION public.test_schedule_follow_ups(_client_id uuid, _new_status_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_status_id uuid;
  _client_law_firm_id uuid;
  _conv_count integer;
  _conversation_id uuid;
  _follow_up record;
  _delay_minutes integer;
  _insert_count integer := 0;
  _follow_up_count integer := 0;
BEGIN
  -- Get current status and law_firm_id
  SELECT custom_status_id, law_firm_id INTO _old_status_id, _client_law_firm_id 
  FROM clients WHERE id = _client_id;
  
  IF _client_law_firm_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found', 'step', 1);
  END IF;
  
  -- Count conversations first
  SELECT COUNT(*) INTO _conv_count FROM conversations WHERE client_id = _client_id;
  
  -- Get conversation ID
  SELECT id INTO _conversation_id
  FROM conversations
  WHERE client_id = _client_id
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT 1;
  
  -- Update the client status
  UPDATE clients SET custom_status_id = _new_status_id WHERE id = _client_id;
  
  -- Check if status actually changed
  IF NOT (_old_status_id IS DISTINCT FROM _new_status_id AND _new_status_id IS NOT NULL) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Status did not change',
      'old_status', _old_status_id,
      'new_status', _new_status_id,
      'step', 2
    );
  END IF;
  
  -- Cancel pending
  UPDATE scheduled_follow_ups
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Test: Status changed'
  WHERE client_id = _client_id AND status = 'pending';
  
  IF _conversation_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'No conversation found',
      'client_law_firm_id', _client_law_firm_id,
      'conv_count', _conv_count,
      'step', 3
    );
  END IF;
  
  -- Count follow-ups for this status
  SELECT COUNT(*) INTO _follow_up_count 
  FROM status_follow_ups 
  WHERE status_id = _new_status_id AND is_active = true;
  
  -- Schedule new
  FOR _follow_up IN
    SELECT * FROM status_follow_ups
    WHERE status_id = _new_status_id AND is_active = true
    ORDER BY position ASC
  LOOP
    _delay_minutes := CASE _follow_up.delay_unit
      WHEN 'hour' THEN _follow_up.delay_minutes * 60
      WHEN 'day' THEN _follow_up.delay_minutes * 60 * 24
      ELSE _follow_up.delay_minutes
    END;
    
    INSERT INTO scheduled_follow_ups (
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
    'conv_count', _conv_count,
    'follow_ups_available', _follow_up_count,
    'follow_ups_created', _insert_count
  );
END;
$$;
