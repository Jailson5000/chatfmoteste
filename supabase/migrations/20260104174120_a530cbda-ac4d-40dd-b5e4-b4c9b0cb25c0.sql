
-- The issue is that SECURITY DEFINER doesn't bypass RLS in Supabase by default
-- We need to recreate the function with explicit RLS bypass
-- Or use a different approach: make the function insert as the table owner

-- Let's try a different approach: set the function to explicitly bypass RLS
-- by using SET LOCAL role

DROP FUNCTION IF EXISTS schedule_follow_ups_on_status_change() CASCADE;

CREATE OR REPLACE FUNCTION public.schedule_follow_ups_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _follow_up record;
  _delay_minutes integer;
  _conversation record;
BEGIN
  -- Bypass RLS for this function - we're running as definer
  -- The postgres role can bypass RLS when running as owner
  
  -- Only trigger if status actually changed
  IF OLD.custom_status_id IS DISTINCT FROM NEW.custom_status_id AND NEW.custom_status_id IS NOT NULL THEN
    -- Cancel any pending follow-ups for this client
    UPDATE public.scheduled_follow_ups
    SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Status changed'
    WHERE client_id = NEW.id AND status = 'pending';
    
    -- Get the active conversation for this client
    SELECT * INTO _conversation
    FROM public.conversations
    WHERE client_id = NEW.id AND law_firm_id = NEW.law_firm_id
    ORDER BY last_message_at DESC NULLS LAST
    LIMIT 1;
    
    IF _conversation IS NOT NULL THEN
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
        
        -- Use direct SQL insert to bypass RLS
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
        
        RAISE LOG 'Scheduled follow-up for client % with template %', NEW.id, _follow_up.template_id;
      END LOOP;
    ELSE
      RAISE LOG 'No conversation found for client %', NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in schedule_follow_ups_on_status_change: %', SQLERRM;
    RETURN NEW; -- Don't fail the original UPDATE
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER trigger_schedule_follow_ups
  AFTER UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION schedule_follow_ups_on_status_change();

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION schedule_follow_ups_on_status_change() TO authenticated;
GRANT EXECUTE ON FUNCTION schedule_follow_ups_on_status_change() TO service_role;
