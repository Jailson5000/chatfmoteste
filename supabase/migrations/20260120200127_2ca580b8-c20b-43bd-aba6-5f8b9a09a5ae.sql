-- =====================================================
-- MIGRATION: Unify duplicate conversations and prevent future duplicates
-- =====================================================

-- 1) Create function to unify duplicate conversations within the same instance
CREATE OR REPLACE FUNCTION public.unify_duplicate_conversations(_law_firm_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _group record;
  _duplicate record;
  _primary_id uuid;
  _deleted_count integer := 0;
  _unified_groups text[] := '{}';
  _filter_law_firm uuid;
BEGIN
  -- If no law_firm_id provided, process all
  _filter_law_firm := _law_firm_id;
  
  -- For each duplicated (remote_jid, whatsapp_instance_id) group
  FOR _group IN
    SELECT 
      remote_jid,
      whatsapp_instance_id,
      law_firm_id,
      COUNT(*) as cnt
    FROM public.conversations
    WHERE 
      whatsapp_instance_id IS NOT NULL
      AND remote_jid IS NOT NULL
      AND (_filter_law_firm IS NULL OR law_firm_id = _filter_law_firm)
    GROUP BY remote_jid, whatsapp_instance_id, law_firm_id
    HAVING COUNT(*) > 1
  LOOP
    -- Get the oldest (primary) conversation in this group
    SELECT id INTO _primary_id
    FROM public.conversations
    WHERE law_firm_id = _group.law_firm_id
      AND remote_jid = _group.remote_jid
      AND whatsapp_instance_id = _group.whatsapp_instance_id
    ORDER BY created_at ASC
    LIMIT 1;

    -- Transfer all related data from duplicates to primary
    FOR _duplicate IN
      SELECT id
      FROM public.conversations
      WHERE law_firm_id = _group.law_firm_id
        AND remote_jid = _group.remote_jid
        AND whatsapp_instance_id = _group.whatsapp_instance_id
        AND id != _primary_id
    LOOP
      -- Move messages to primary conversation
      UPDATE public.messages 
      SET conversation_id = _primary_id 
      WHERE conversation_id = _duplicate.id;
      
      -- Move appointments
      UPDATE public.appointments 
      SET conversation_id = _primary_id 
      WHERE conversation_id = _duplicate.id;
      
      -- Move cases
      UPDATE public.cases 
      SET conversation_id = _primary_id 
      WHERE conversation_id = _duplicate.id;
      
      -- Move documents
      UPDATE public.documents 
      SET conversation_id = _primary_id 
      WHERE conversation_id = _duplicate.id;
      
      -- Move scheduled follow-ups
      UPDATE public.scheduled_follow_ups 
      SET conversation_id = _primary_id 
      WHERE conversation_id = _duplicate.id;
      
      -- Move AI processing queue items
      UPDATE public.ai_processing_queue 
      SET conversation_id = _primary_id 
      WHERE conversation_id = _duplicate.id;
      
      -- Move AI transfer logs
      UPDATE public.ai_transfer_logs 
      SET conversation_id = _primary_id 
      WHERE conversation_id = _duplicate.id;
      
      -- Move Google Calendar events
      UPDATE public.google_calendar_events 
      SET conversation_id = _primary_id 
      WHERE conversation_id = _duplicate.id;
      
      -- Move Google Calendar AI logs
      UPDATE public.google_calendar_ai_logs 
      SET conversation_id = _primary_id 
      WHERE conversation_id = _duplicate.id;

      -- Delete the duplicate conversation
      DELETE FROM public.conversations WHERE id = _duplicate.id;
      _deleted_count := _deleted_count + 1;
    END LOOP;
    
    _unified_groups := array_append(_unified_groups, _group.remote_jid || ' (deleted ' || (_group.cnt - 1)::text || ' duplicates)');
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', _deleted_count,
    'unified_groups', _unified_groups
  );
END;
$function$;

-- 2) Run unification for all law firms
SELECT public.unify_duplicate_conversations(NULL);

-- 3) Create unique index to prevent future duplicates
-- Only for conversations with whatsapp_instance_id (WhatsApp conversations)
-- Excludes archived conversations with instance_unification reason (permanently inactive)
DROP INDEX IF EXISTS idx_conversations_unique_remote_jid_instance;
CREATE UNIQUE INDEX idx_conversations_unique_remote_jid_instance
ON public.conversations (remote_jid, whatsapp_instance_id, law_firm_id)
WHERE whatsapp_instance_id IS NOT NULL
  AND (archived_reason IS NULL OR archived_reason != 'instance_unification');

-- 4) Also add a partial unique index for active (non-archived) conversations
-- This is a stricter constraint for the common case
DROP INDEX IF EXISTS idx_conversations_unique_active_remote_jid;
CREATE UNIQUE INDEX idx_conversations_unique_active_remote_jid
ON public.conversations (remote_jid, whatsapp_instance_id, law_firm_id)
WHERE whatsapp_instance_id IS NOT NULL
  AND archived_at IS NULL;