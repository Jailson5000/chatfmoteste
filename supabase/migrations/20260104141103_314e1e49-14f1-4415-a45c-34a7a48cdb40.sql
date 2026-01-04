-- Create table for follow-up rules per status
CREATE TABLE public.status_follow_ups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status_id UUID NOT NULL REFERENCES public.custom_statuses(id) ON DELETE CASCADE,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  delay_minutes INTEGER NOT NULL DEFAULT 30,
  delay_unit TEXT NOT NULL DEFAULT 'min', -- 'min', 'hour', 'day'
  position INTEGER NOT NULL DEFAULT 0,
  give_up_on_no_response BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for scheduled follow-ups (pending messages)
CREATE TABLE public.scheduled_follow_ups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  follow_up_rule_id UUID NOT NULL REFERENCES public.status_follow_ups(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancel_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'cancelled', 'failed'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.status_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_follow_ups ENABLE ROW LEVEL SECURITY;

-- RLS policies for status_follow_ups
CREATE POLICY "Users can view follow-ups of their law firm"
ON public.status_follow_ups FOR SELECT
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can insert follow-ups for their law firm"
ON public.status_follow_ups FOR INSERT
WITH CHECK (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can update follow-ups of their law firm"
ON public.status_follow_ups FOR UPDATE
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can delete follow-ups of their law firm"
ON public.status_follow_ups FOR DELETE
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- RLS policies for scheduled_follow_ups
CREATE POLICY "Users can view scheduled follow-ups of their law firm"
ON public.scheduled_follow_ups FOR SELECT
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can insert scheduled follow-ups for their law firm"
ON public.scheduled_follow_ups FOR INSERT
WITH CHECK (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can update scheduled follow-ups of their law firm"
ON public.scheduled_follow_ups FOR UPDATE
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can delete scheduled follow-ups of their law firm"
ON public.scheduled_follow_ups FOR DELETE
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_status_follow_ups_status_id ON public.status_follow_ups(status_id);
CREATE INDEX idx_status_follow_ups_law_firm ON public.status_follow_ups(law_firm_id);
CREATE INDEX idx_scheduled_follow_ups_pending ON public.scheduled_follow_ups(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_scheduled_follow_ups_conversation ON public.scheduled_follow_ups(conversation_id);
CREATE INDEX idx_scheduled_follow_ups_client ON public.scheduled_follow_ups(client_id);

-- Trigger to update updated_at
CREATE TRIGGER update_status_follow_ups_updated_at
BEFORE UPDATE ON public.status_follow_ups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add description column to custom_statuses if not exists
ALTER TABLE public.custom_statuses ADD COLUMN IF NOT EXISTS description TEXT;

-- Function to schedule follow-ups when client status changes
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
BEGIN
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
END;
$$;

-- Create trigger for scheduling follow-ups
CREATE TRIGGER trigger_schedule_follow_ups
AFTER UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.schedule_follow_ups_on_status_change();

-- Function to cancel follow-ups when client responds
CREATE OR REPLACE FUNCTION public.cancel_follow_ups_on_client_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only for incoming messages (not from us)
  IF NEW.is_from_me = false THEN
    -- Cancel pending follow-ups for this conversation
    UPDATE public.scheduled_follow_ups
    SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Client responded'
    WHERE conversation_id = NEW.conversation_id AND status = 'pending';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for cancelling follow-ups on client message
CREATE TRIGGER trigger_cancel_follow_ups_on_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.cancel_follow_ups_on_client_message();