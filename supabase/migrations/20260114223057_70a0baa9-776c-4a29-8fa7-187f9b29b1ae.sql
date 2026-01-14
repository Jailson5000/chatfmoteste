
-- Hardening + logic fix for tab counts:
-- 1) Enforce tenant isolation (no cross-tenant counting)
-- 2) Make "Fila" match frontend semantics (unassigned OR human-without-assignee), excluding archived
-- 3) Remove anon/public execute grants (authenticated only)

CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(_law_firm_id uuid, _user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant_id uuid;
  chat_count integer;
  ai_count integer;
  queue_count integer;
  all_count integer;
  archived_count integer;
BEGIN
  -- Enforce tenant isolation
  tenant_id := public.get_user_law_firm_id(auth.uid());
  IF tenant_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _law_firm_id IS NULL OR _law_firm_id <> tenant_id THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  -- Chat: assigned to this user, handler = human, NOT archived
  SELECT COUNT(*) INTO chat_count
  FROM public.conversations c
  WHERE c.law_firm_id = tenant_id
    AND c.assigned_to = _user_id
    AND c.current_handler = 'human'
    AND c.archived_at IS NULL;

  -- AI: handler = ai WITH active automation, NOT archived
  SELECT COUNT(*) INTO ai_count
  FROM public.conversations c
  WHERE c.law_firm_id = tenant_id
    AND c.archived_at IS NULL
    AND c.current_handler = 'ai'
    AND c.current_automation_id IS NOT NULL;

  -- Queue (Fila): match frontend "effective handler" logic
  -- include:
  --  - unassigned (assigned_to IS NULL AND NOT actively AI)
  --  - human with no assigned user
  -- exclude:
  --  - archived
  --  - actively AI (current_handler='ai' AND current_automation_id IS NOT NULL)
  SELECT COUNT(*) INTO queue_count
  FROM public.conversations c
  WHERE c.law_firm_id = tenant_id
    AND c.archived_at IS NULL
    AND c.assigned_to IS NULL
    AND (c.current_handler <> 'ai' OR c.current_automation_id IS NULL);

  -- All: all non-archived conversations
  SELECT COUNT(*) INTO all_count
  FROM public.conversations c
  WHERE c.law_firm_id = tenant_id
    AND c.archived_at IS NULL;

  -- Archived: all archived conversations
  SELECT COUNT(*) INTO archived_count
  FROM public.conversations c
  WHERE c.law_firm_id = tenant_id
    AND c.archived_at IS NOT NULL;

  RETURN jsonb_build_object(
    'chat', chat_count,
    'ai', ai_count,
    'queue', queue_count,
    'all', all_count,
    'archived', archived_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_tab_counts(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_conversation_tab_counts(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_conversation_tab_counts(uuid, uuid) TO authenticated;
