
-- Recriar a função do trigger com melhor logging e debugging
CREATE OR REPLACE FUNCTION public.schedule_follow_ups_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _follow_up record;
  _delay_minutes integer;
  _conversation record;
  _insert_count integer := 0;
BEGIN
  -- Log the trigger invocation
  RAISE NOTICE '[schedule_follow_ups] Trigger fired. OLD status: %, NEW status: %', 
    OLD.custom_status_id, NEW.custom_status_id;
  
  -- Only trigger if status actually changed and new status is not null
  IF OLD.custom_status_id IS DISTINCT FROM NEW.custom_status_id AND NEW.custom_status_id IS NOT NULL THEN
    RAISE NOTICE '[schedule_follow_ups] Status changed for client %. Cancelling old and scheduling new.', NEW.id;
    
    -- Cancel any pending follow-ups for this client
    UPDATE public.scheduled_follow_ups
    SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Status changed'
    WHERE client_id = NEW.id AND status = 'pending';
    
    -- Get the active conversation for this client (most recent)
    SELECT * INTO _conversation
    FROM public.conversations
    WHERE client_id = NEW.id AND law_firm_id = NEW.law_firm_id AND archived_at IS NULL
    ORDER BY last_message_at DESC NULLS LAST, created_at DESC
    LIMIT 1;
    
    IF _conversation IS NOT NULL THEN
      RAISE NOTICE '[schedule_follow_ups] Found conversation % for client %', _conversation.id, NEW.id;
      
      -- Schedule new follow-ups based on the new status
      FOR _follow_up IN
        SELECT * FROM public.status_follow_ups
        WHERE status_id = NEW.custom_status_id
          AND is_active = true
        ORDER BY position ASC
      LOOP
        -- Calculate delay in minutes
        _delay_minutes := CASE _follow_up.delay_unit
          WHEN 'hour' THEN _follow_up.delay_minutes * 60
          WHEN 'day' THEN _follow_up.delay_minutes * 60 * 24
          ELSE _follow_up.delay_minutes
        END;
        
        RAISE NOTICE '[schedule_follow_ups] Scheduling follow-up with template %, delay % minutes', 
          _follow_up.template_id, _delay_minutes;
        
        -- Insert the scheduled follow-up
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
        
        _insert_count := _insert_count + 1;
      END LOOP;
      
      RAISE NOTICE '[schedule_follow_ups] Scheduled % follow-ups for client %', _insert_count, NEW.id;
    ELSE
      RAISE NOTICE '[schedule_follow_ups] No active conversation found for client %', NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[schedule_follow_ups] Error: %', SQLERRM;
    RETURN NEW; -- Don't fail the original UPDATE
END;
$$;
