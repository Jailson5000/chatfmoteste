-- Fix: Add authorization check to mark_messages_as_read function
-- This prevents users from marking messages as read in conversations from other organizations

CREATE OR REPLACE FUNCTION public.mark_messages_as_read(_conversation_id uuid, _user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Authorization check: verify user belongs to the same law_firm as the conversation
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    INNER JOIN public.profiles p ON p.law_firm_id = c.law_firm_id
    WHERE c.id = _conversation_id AND p.id = _user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: User does not belong to this conversation''s organization';
  END IF;

  -- Only mark messages not from me and not already read
  UPDATE public.messages
  SET read_at = NOW()
  WHERE conversation_id = _conversation_id
    AND is_from_me = false
    AND read_at IS NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$function$;