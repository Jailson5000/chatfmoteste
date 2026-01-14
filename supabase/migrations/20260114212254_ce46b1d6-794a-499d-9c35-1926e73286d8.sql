-- Função RPC simplificada que retorna JSONB (evita problemas de tipos)
DROP FUNCTION IF EXISTS public.get_conversations_with_metadata(uuid);

CREATE OR REPLACE FUNCTION public.get_conversations_with_metadata(_law_firm_id uuid)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    -- Base conversation fields
    'id', c.id,
    'law_firm_id', c.law_firm_id,
    'remote_jid', c.remote_jid,
    'contact_name', c.contact_name,
    'contact_phone', c.contact_phone,
    'status', c.status,
    'priority', c.priority,
    'current_handler', c.current_handler,
    'assigned_to', c.assigned_to,
    'current_automation_id', c.current_automation_id,
    'department_id', c.department_id,
    'client_id', c.client_id,
    'whatsapp_instance_id', c.whatsapp_instance_id,
    'last_message_at', c.last_message_at,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'ai_summary', c.ai_summary,
    'internal_notes', c.internal_notes,
    'tags', c.tags,
    'needs_human_handoff', c.needs_human_handoff,
    'ai_audio_enabled', c.ai_audio_enabled,
    'ai_audio_enabled_by', c.ai_audio_enabled_by,
    'ai_audio_last_enabled_at', c.ai_audio_last_enabled_at,
    'ai_audio_last_disabled_at', c.ai_audio_last_disabled_at,
    'archived_at', c.archived_at,
    'archived_reason', c.archived_reason,
    'archived_next_responsible_id', c.archived_next_responsible_id,
    'archived_next_responsible_type', c.archived_next_responsible_type,
    'origin', c.origin,
    'origin_metadata', c.origin_metadata,
    'last_summarized_at', c.last_summarized_at,
    'summary_message_count', c.summary_message_count,
    'n8n_last_response_at', c.n8n_last_response_at,
    -- Related data
    'whatsapp_instance', CASE WHEN wi.id IS NOT NULL THEN
      jsonb_build_object('instance_name', wi.instance_name, 'display_name', wi.display_name, 'phone_number', wi.phone_number)
    ELSE NULL END,
    'current_automation', CASE WHEN a.id IS NOT NULL THEN
      jsonb_build_object('id', a.id, 'name', a.name)
    ELSE NULL END,
    'department', CASE WHEN d.id IS NOT NULL THEN
      jsonb_build_object('id', d.id, 'name', d.name, 'color', d.color)
    ELSE NULL END,
    'client', CASE WHEN cl.id IS NOT NULL THEN
      jsonb_build_object(
        'id', cl.id,
        'custom_status_id', cl.custom_status_id,
        'avatar_url', cl.avatar_url,
        'custom_status', CASE WHEN cs.id IS NOT NULL THEN
          jsonb_build_object('id', cs.id, 'name', cs.name, 'color', cs.color)
        ELSE NULL END
      )
    ELSE NULL END,
    'assigned_profile', CASE WHEN p.id IS NOT NULL THEN
      jsonb_build_object('full_name', p.full_name)
    ELSE NULL END,
    'client_tags', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('name', t.name, 'color', t.color))
       FROM client_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.client_id = cl.id),
      '[]'::jsonb
    ),
    'last_message', (
      SELECT jsonb_build_object('content', m.content, 'created_at', m.created_at, 'message_type', m.message_type, 'is_from_me', m.is_from_me)
      FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
    ),
    'unread_count', (
      SELECT COUNT(*) FROM messages m
      WHERE m.conversation_id = c.id AND m.is_from_me = false AND m.read_at IS NULL
    )
  )
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