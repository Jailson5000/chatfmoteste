
-- Fix the get_conversation_tab_counts function to properly exclude archived from queue
-- and count archived correctly

CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(_law_firm_id uuid, _user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  chat_count integer;
  ai_count integer;
  queue_count integer;
  all_count integer;
  archived_count integer;
BEGIN
  -- Chat: assigned to this user, handler = human, NOT archived
  SELECT COUNT(*) INTO chat_count
  FROM conversations c
  WHERE c.law_firm_id = _law_firm_id
    AND c.assigned_to = _user_id
    AND c.current_handler = 'human'
    AND c.archived_at IS NULL;

  -- AI: handler = ai, has active automation, NOT archived
  SELECT COUNT(*) INTO ai_count
  FROM conversations c
  WHERE c.law_firm_id = _law_firm_id
    AND c.current_handler = 'ai'
    AND c.current_automation_id IS NOT NULL
    AND c.archived_at IS NULL;

  -- Queue: no assigned user, NOT archived (critical fix!)
  -- Must explicitly check archived_at IS NULL
  SELECT COUNT(*) INTO queue_count
  FROM conversations c
  WHERE c.law_firm_id = _law_firm_id
    AND c.archived_at IS NULL
    AND c.assigned_to IS NULL;

  -- All: all non-archived conversations
  SELECT COUNT(*) INTO all_count
  FROM conversations c
  WHERE c.law_firm_id = _law_firm_id
    AND c.archived_at IS NULL;

  -- Archived: all archived conversations (archived_at IS NOT NULL)
  SELECT COUNT(*) INTO archived_count
  FROM conversations c
  WHERE c.law_firm_id = _law_firm_id
    AND c.archived_at IS NOT NULL;

  result := jsonb_build_object(
    'chat', chat_count,
    'ai', ai_count,
    'queue', queue_count,
    'all', all_count,
    'archived', archived_count
  );

  RETURN result;
END;
$$;
