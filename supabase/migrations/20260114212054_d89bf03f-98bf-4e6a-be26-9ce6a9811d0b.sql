-- Função RPC para buscar conversas com last_message e unread_count em uma única query
-- Elimina o problema N+1 que causa lentidão

CREATE OR REPLACE FUNCTION public.get_conversations_with_metadata(_law_firm_id uuid)
RETURNS TABLE (
  -- Conversation fields
  id uuid,
  law_firm_id uuid,
  remote_jid text,
  contact_name text,
  contact_phone text,
  status text,
  priority integer,
  current_handler text,
  assigned_to uuid,
  current_automation_id uuid,
  department_id uuid,
  client_id uuid,
  whatsapp_instance_id uuid,
  last_message_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  ai_summary text,
  internal_notes text,
  tags text[],
  needs_human_handoff boolean,
  ai_audio_enabled boolean,
  archived_at timestamptz,
  origin text,
  -- Related data as JSONB
  whatsapp_instance jsonb,
  current_automation jsonb,
  department jsonb,
  client jsonb,
  assigned_profile jsonb,
  client_tags jsonb,
  last_message jsonb,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.law_firm_id,
    c.remote_jid,
    c.contact_name,
    c.contact_phone,
    c.status::text,
    c.priority,
    c.current_handler::text,
    c.assigned_to,
    c.current_automation_id,
    c.department_id,
    c.client_id,
    c.whatsapp_instance_id,
    c.last_message_at,
    c.created_at,
    c.updated_at,
    c.ai_summary,
    c.internal_notes,
    c.tags,
    c.needs_human_handoff,
    c.ai_audio_enabled,
    c.archived_at,
    c.origin,
    -- WhatsApp Instance
    CASE WHEN wi.id IS NOT NULL THEN
      jsonb_build_object(
        'instance_name', wi.instance_name,
        'display_name', wi.display_name,
        'phone_number', wi.phone_number
      )
    ELSE NULL END AS whatsapp_instance,
    -- Current Automation
    CASE WHEN a.id IS NOT NULL THEN
      jsonb_build_object('id', a.id, 'name', a.name)
    ELSE NULL END AS current_automation,
    -- Department
    CASE WHEN d.id IS NOT NULL THEN
      jsonb_build_object('id', d.id, 'name', d.name, 'color', d.color)
    ELSE NULL END AS department,
    -- Client with custom_status
    CASE WHEN cl.id IS NOT NULL THEN
      jsonb_build_object(
        'id', cl.id,
        'custom_status_id', cl.custom_status_id,
        'avatar_url', cl.avatar_url,
        'custom_status', CASE WHEN cs.id IS NOT NULL THEN
          jsonb_build_object('id', cs.id, 'name', cs.name, 'color', cs.color)
        ELSE NULL END
      )
    ELSE NULL END AS client,
    -- Assigned Profile
    CASE WHEN p.id IS NOT NULL THEN
      jsonb_build_object('full_name', p.full_name)
    ELSE NULL END AS assigned_profile,
    -- Client Tags (aggregated)
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('name', t.name, 'color', t.color))
       FROM client_tags ct
       JOIN tags t ON t.id = ct.tag_id
       WHERE ct.client_id = cl.id),
      '[]'::jsonb
    ) AS client_tags,
    -- Last Message (subquery)
    (SELECT jsonb_build_object(
        'content', m.content,
        'created_at', m.created_at,
        'message_type', m.message_type,
        'is_from_me', m.is_from_me
      )
     FROM messages m
     WHERE m.conversation_id = c.id
     ORDER BY m.created_at DESC
     LIMIT 1
    ) AS last_message,
    -- Unread Count (subquery)
    (SELECT COUNT(*)
     FROM messages m
     WHERE m.conversation_id = c.id
       AND m.is_from_me = false
       AND m.read_at IS NULL
    ) AS unread_count
  FROM conversations c
  LEFT JOIN whatsapp_instances wi ON wi.id = c.whatsapp_instance_id
  LEFT JOIN automations a ON a.id = c.current_automation_id
  LEFT JOIN departments d ON d.id = c.department_id
  LEFT JOIN clients cl ON cl.id = c.client_id
  LEFT JOIN custom_statuses cs ON cs.id = cl.custom_status_id
  LEFT JOIN profiles p ON p.id = c.assigned_to
  WHERE c.law_firm_id = _law_firm_id
  ORDER BY c.last_message_at DESC NULLS LAST;
$$;