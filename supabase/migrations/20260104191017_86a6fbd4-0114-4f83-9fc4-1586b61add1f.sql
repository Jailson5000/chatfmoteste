-- =====================================================
-- Follow-ups: evitar corrida (pending vs envio) e garantir cancelamento
-- =====================================================

-- 1) Adicionar started_at para suportar status "processing" com rastreio
ALTER TABLE public.scheduled_follow_ups
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;

-- 2) Cancelar follow-ups também quando estiverem em processamento
CREATE OR REPLACE FUNCTION public.cancel_follow_ups_on_client_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only for incoming messages (not from us)
  IF NEW.is_from_me = false THEN
    -- Cancel pending/processing follow-ups for this conversation
    UPDATE public.scheduled_follow_ups
    SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Client responded'
    WHERE conversation_id = NEW.conversation_id AND status IN ('pending', 'processing');
  END IF;
  
  RETURN NEW;
END;
$function$;

-- 3) Ao mudar status do cliente via RPC, cancelar pendentes/processing antes de reagendar
CREATE OR REPLACE FUNCTION public.update_client_status_with_follow_ups(_client_id uuid, _new_status_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_status_id uuid;
  _client_law_firm_id uuid;
  _conversation_id uuid;
  _follow_up record;
  _delay_minutes integer;
  _insert_count integer := 0;
BEGIN
  -- Get current status and law_firm_id
  SELECT custom_status_id, law_firm_id INTO _old_status_id, _client_law_firm_id 
  FROM public.clients WHERE id = _client_id;
  
  IF _client_law_firm_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
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
$function$;

-- 4) Trigger de status (se usado) também deve cancelar pending/processing
CREATE OR REPLACE FUNCTION public.schedule_follow_ups_on_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _follow_up record;
  _delay_minutes integer;
  _conversation record;
BEGIN
  -- Only trigger if status actually changed and new status is not null
  IF OLD.custom_status_id IS DISTINCT FROM NEW.custom_status_id AND NEW.custom_status_id IS NOT NULL THEN
    -- Cancel any pending/processing follow-ups for this client
    UPDATE public.scheduled_follow_ups
    SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Status changed'
    WHERE client_id = NEW.id AND status IN ('pending','processing');

    -- Get the most recent conversation for this client (even if archived)
    SELECT * INTO _conversation
    FROM public.conversations
    WHERE client_id = NEW.id AND law_firm_id = NEW.law_firm_id
    ORDER BY last_message_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

    IF _conversation IS NOT NULL THEN
      FOR _follow_up IN
        SELECT * FROM public.status_follow_ups
        WHERE status_id = NEW.custom_status_id
          AND is_active = true
        ORDER BY position ASC
      LOOP
        _delay_minutes := CASE _follow_up.delay_unit
          WHEN 'hour' THEN _follow_up.delay_minutes * 60
          WHEN 'day' THEN _follow_up.delay_minutes * 60 * 24
          ELSE _follow_up.delay_minutes
        END;

        INSERT INTO public.scheduled_follow_ups (
          law_firm_id,
          client_id,
          conversation_id,
          follow_up_rule_id,
          template_id,
          scheduled_at,
          status
        ) VALUES (
          NEW.law_firm_id,
          NEW.id,
          _conversation.id,
          _follow_up.id,
          _follow_up.template_id,
          now() + (_delay_minutes || ' minutes')::interval,
          'pending'
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail original UPDATE
    RETURN NEW;
END;
$function$;