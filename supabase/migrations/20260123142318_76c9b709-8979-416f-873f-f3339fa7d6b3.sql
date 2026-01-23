-- Drop and recreate the function with an optional parameter to include archived
DROP FUNCTION IF EXISTS get_conversations_with_metadata(uuid, integer, integer);

CREATE OR REPLACE FUNCTION get_conversations_with_metadata(
  _law_firm_id uuid, 
  _limit integer DEFAULT 30, 
  _offset integer DEFAULT 0,
  _include_archived boolean DEFAULT false
)
RETURNS TABLE(
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
  last_whatsapp_instance_id uuid, 
  last_message_at timestamp with time zone, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone, 
  ai_summary text, 
  internal_notes text, 
  tags text[], 
  needs_human_handoff boolean, 
  ai_audio_enabled boolean, 
  ai_audio_enabled_by text, 
  ai_audio_last_enabled_at timestamp with time zone, 
  ai_audio_last_disabled_at timestamp with time zone, 
  archived_at timestamp with time zone, 
  archived_reason text, 
  archived_next_responsible_id uuid, 
  archived_next_responsible_type text, 
  origin text, 
  origin_metadata jsonb, 
  last_summarized_at timestamp with time zone, 
  summary_message_count integer, 
  n8n_last_response_at timestamp with time zone, 
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
SET search_path TO 'public'
AS $function$
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
    c.last_whatsapp_instance_id,
    c.last_message_at,
    c.created_at,
    c.updated_at,
    c.ai_summary,
    c.internal_notes,
    c.tags,
    c.needs_human_handoff,
    c.ai_audio_enabled,
    c.ai_audio_enabled_by,
    c.ai_audio_last_enabled_at,
    c.ai_audio_last_disabled_at,
    c.archived_at,
    c.archived_reason,
    c.archived_next_responsible_id,
    c.archived_next_responsible_type,
    c.origin,
    c.origin_metadata,
    c.last_summarized_at,
    c.summary_message_count,
    c.n8n_last_response_at,
    CASE WHEN w.id IS NOT NULL THEN jsonb_build_object('instance_name', w.instance_name, 'display_name', w.display_name, 'phone_number', w.phone_number) ELSE NULL END,
    CASE WHEN a.id IS NOT NULL THEN jsonb_build_object('id', a.id, 'name', a.name) ELSE NULL END,
    CASE WHEN d.id IS NOT NULL THEN jsonb_build_object('id', d.id, 'name', d.name, 'color', d.color) ELSE NULL END,
    CASE WHEN cl.id IS NOT NULL THEN jsonb_build_object('id', cl.id, 'custom_status_id', cl.custom_status_id, 'avatar_url', cl.avatar_url, 'custom_status', CASE WHEN cs.id IS NOT NULL THEN jsonb_build_object('id', cs.id, 'name', cs.name, 'color', cs.color) ELSE NULL END) ELSE NULL END,
    CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('full_name', p.full_name) ELSE NULL END,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', t.name, 'color', t.color))
      FROM client_tags ct
      JOIN tags t ON t.id = ct.tag_id
      WHERE ct.client_id = cl.id
    ), '[]'::jsonb),
    (
      SELECT jsonb_build_object('content', m.content, 'created_at', m.created_at, 'message_type', m.message_type, 'is_from_me', m.is_from_me)
      FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ),
    (
      SELECT COUNT(*)::bigint
      FROM messages m
      WHERE m.conversation_id = c.id
        AND m.is_from_me = false
        AND m.read_at IS NULL
    )
  FROM conversations c
  LEFT JOIN whatsapp_instances w ON w.id = c.whatsapp_instance_id
  LEFT JOIN automations a ON a.id = c.current_automation_id
  LEFT JOIN departments d ON d.id = c.department_id
  LEFT JOIN clients cl ON cl.id = c.client_id
  LEFT JOIN custom_statuses cs ON cs.id = cl.custom_status_id
  LEFT JOIN profiles p ON p.id = c.assigned_to
  WHERE c.law_firm_id = _law_firm_id
    AND (
      -- If _include_archived is true, return ALL conversations
      -- If _include_archived is false (default), return only non-archived
      _include_archived = true OR c.archived_at IS NULL
    )
  ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
  LIMIT _limit
  OFFSET _offset;
$function$;