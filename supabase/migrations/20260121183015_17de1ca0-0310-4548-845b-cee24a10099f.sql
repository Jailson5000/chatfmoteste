
-- =====================================================
-- SECURITY FIX: Add tenant validation to SECURITY DEFINER functions
-- These functions accept law_firm_id as parameter but don't validate
-- that the authenticated user belongs to that tenant
-- =====================================================

-- 1. Fix get_conversations_with_metadata - add tenant validation
CREATE OR REPLACE FUNCTION public.get_conversations_with_metadata(_law_firm_id uuid)
RETURNS SETOF jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- SECURITY: Validate caller belongs to the requested law_firm or is global admin
  SELECT CASE 
    WHEN NOT (
      _law_firm_id = get_user_law_firm_id(auth.uid()) 
      OR is_admin(auth.uid())
    )
    THEN (SELECT jsonb_build_object('error', 'access_denied') WHERE false) -- Returns empty set
  END;

  SELECT jsonb_build_object(
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
    'whatsapp_instance', CASE 
      WHEN wi.id IS NOT NULL THEN jsonb_build_object(
        'instance_name', wi.instance_name,
        'display_name', wi.display_name,
        'phone_number', wi.phone_number
      )
      ELSE NULL 
    END,
    'current_automation', CASE 
      WHEN a.id IS NOT NULL THEN jsonb_build_object(
        'id', a.id,
        'name', a.name
      )
      ELSE NULL 
    END,
    'department', CASE 
      WHEN d.id IS NOT NULL THEN jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'color', d.color
      )
      ELSE NULL 
    END,
    'client', CASE 
      WHEN cl.id IS NOT NULL THEN jsonb_build_object(
        'id', cl.id,
        'custom_status_id', cl.custom_status_id,
        'avatar_url', cl.avatar_url,
        'custom_status', CASE 
          WHEN cs.id IS NOT NULL THEN jsonb_build_object(
            'id', cs.id,
            'name', cs.name,
            'color', cs.color
          )
          ELSE NULL 
        END
      )
      ELSE NULL 
    END,
    'assigned_profile', CASE 
      WHEN p.id IS NOT NULL THEN jsonb_build_object(
        'full_name', p.full_name
      )
      ELSE NULL 
    END,
    'client_tags', COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('name', t.name, 'color', t.color))
        FROM client_tags ct
        JOIN tags t ON t.id = ct.tag_id
        WHERE ct.client_id = cl.id
      ),
      '[]'::jsonb
    ),
    'last_message', (
      SELECT jsonb_build_object(
        'content', m.content,
        'created_at', m.created_at,
        'message_type', m.message_type,
        'is_from_me', m.is_from_me
      )
      FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ),
    'unread_count', (
      SELECT COUNT(*)
      FROM messages m
      WHERE m.conversation_id = c.id
        AND m.is_from_me = false
        AND m.read_at IS NULL
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
    AND (
      _law_firm_id = get_user_law_firm_id(auth.uid()) 
      OR is_admin(auth.uid())
    )
  ORDER BY c.last_message_at DESC NULLS LAST
  LIMIT 30;
$$;

-- 2. Fix check_company_limit - add tenant validation
CREATE OR REPLACE FUNCTION public.check_company_limit(
  _law_firm_id uuid, 
  _limit_type text, 
  _increment integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _usage record;
  _current_value integer;
  _max_value integer;
  _buffer_max integer;
  _caller_law_firm_id uuid;
BEGIN
  -- SECURITY: Validate caller belongs to the requested law_firm or is global admin
  _caller_law_firm_id := get_user_law_firm_id(auth.uid());
  IF _caller_law_firm_id IS NULL AND NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'not_authenticated');
  END IF;
  
  IF _law_firm_id <> _caller_law_firm_id AND NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'access_denied');
  END IF;

  SELECT * INTO _usage FROM public.company_usage_summary WHERE law_firm_id = _law_firm_id;
  
  IF _usage IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Empresa não encontrada');
  END IF;
  
  CASE _limit_type
    WHEN 'users' THEN
      _current_value := _usage.current_users;
      _max_value := _usage.effective_max_users;
    WHEN 'instances' THEN
      _current_value := _usage.current_instances;
      _max_value := _usage.effective_max_instances;
    WHEN 'agents' THEN
      _current_value := _usage.current_agents;
      _max_value := _usage.effective_max_agents;
    WHEN 'ai_conversations' THEN
      _current_value := _usage.current_ai_conversations;
      _max_value := _usage.effective_max_ai_conversations;
    WHEN 'tts_minutes' THEN
      _current_value := _usage.current_tts_minutes::integer;
      _max_value := _usage.effective_max_tts_minutes;
    ELSE
      RETURN jsonb_build_object('allowed', false, 'error', 'Tipo de limite inválido');
  END CASE;
  
  _buffer_max := _max_value + CEIL(_max_value * 0.10);
  
  IF (_current_value + _increment) > _buffer_max THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'current', _current_value,
      'max', _max_value,
      'buffer_max', _buffer_max,
      'needs_upgrade', true,
      'message', 'Limite atingido. Entre em contato com o suporte para ampliar seu plano.'
    );
  ELSIF (_current_value + _increment) > _max_value THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'warning', true,
      'current', _current_value,
      'max', _max_value,
      'message', 'Você está próximo do limite do seu plano. Considere fazer um upgrade.'
    );
  ELSE
    RETURN jsonb_build_object(
      'allowed', true,
      'warning', false,
      'current', _current_value,
      'max', _max_value,
      'percent_used', ROUND((_current_value::numeric / NULLIF(_max_value, 0)::numeric) * 100, 1)
    );
  END IF;
END;
$$;

-- 3. Fix unify_duplicate_clients - add tenant validation
CREATE OR REPLACE FUNCTION public.unify_duplicate_clients(_law_firm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _group record;
  _duplicate record;
  _primary_id uuid;
  _deleted_count integer := 0;
  _unified_groups text[] := '{}';
  _caller_law_firm_id uuid;
BEGIN
  -- SECURITY: Validate caller belongs to the requested law_firm or is global admin
  _caller_law_firm_id := get_user_law_firm_id(auth.uid());
  IF _caller_law_firm_id IS NULL AND NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  
  IF _law_firm_id <> _caller_law_firm_id AND NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  FOR _group IN
    SELECT normalize_phone(phone) AS phone_normalized,
           whatsapp_instance_id
    FROM public.clients
    WHERE law_firm_id = _law_firm_id
    GROUP BY normalize_phone(phone), whatsapp_instance_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO _primary_id
    FROM public.clients
    WHERE law_firm_id = _law_firm_id
      AND normalize_phone(phone) = _group.phone_normalized
      AND (whatsapp_instance_id IS NOT DISTINCT FROM _group.whatsapp_instance_id)
    ORDER BY created_at ASC
    LIMIT 1;

    FOR _duplicate IN
      SELECT id
      FROM public.clients
      WHERE law_firm_id = _law_firm_id
        AND normalize_phone(phone) = _group.phone_normalized
        AND (whatsapp_instance_id IS NOT DISTINCT FROM _group.whatsapp_instance_id)
        AND id != _primary_id
    LOOP
      UPDATE public.conversations SET client_id = _primary_id WHERE client_id = _duplicate.id;
      UPDATE public.client_tags SET client_id = _primary_id WHERE client_id = _duplicate.id;
      UPDATE public.client_actions SET client_id = _primary_id WHERE client_id = _duplicate.id;
      UPDATE public.client_memories SET client_id = _primary_id WHERE client_id = _duplicate.id;
      UPDATE public.cases SET client_id = _primary_id WHERE client_id = _duplicate.id;
      UPDATE public.documents SET client_id = _primary_id WHERE client_id = _duplicate.id;
      UPDATE public.google_calendar_events SET client_id = _primary_id WHERE client_id = _duplicate.id;

      DELETE FROM public.clients WHERE id = _duplicate.id;
      _deleted_count := _deleted_count + 1;
    END LOOP;

    _unified_groups := array_append(
      _unified_groups,
      _group.phone_normalized || '|' || COALESCE(_group.whatsapp_instance_id::text, 'null')
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', _deleted_count,
    'unified_groups', _unified_groups
  );
END;
$$;

-- 4. Fix clone_template_for_company - only global admins should use this
CREATE OR REPLACE FUNCTION public.clone_template_for_company(_law_firm_id uuid, _company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _template record;
    _result jsonb;
    _dept record;
    _status record;
    _tag record;
    _knowledge record;
    _automation_id uuid;
BEGIN
    -- SECURITY: Only global admins can clone templates for companies
    IF NOT is_admin(auth.uid()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'access_denied: only global admins can clone templates');
    END IF;

    SELECT * INTO _template
    FROM public.ai_template_base
    WHERE is_active = true
    ORDER BY version DESC
    LIMIT 1;
    
    IF _template IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhum template ativo encontrado');
    END IF;
    
    INSERT INTO public.law_firm_settings (
        law_firm_id,
        ai_provider,
        ai_capabilities
    ) VALUES (
        _law_firm_id,
        _template.ai_provider,
        _template.ai_capabilities
    )
    ON CONFLICT (law_firm_id) DO UPDATE SET
        ai_provider = EXCLUDED.ai_provider,
        ai_capabilities = EXCLUDED.ai_capabilities,
        updated_at = now();
    
    INSERT INTO public.automations (
        law_firm_id,
        name,
        description,
        trigger_type,
        trigger_config,
        ai_prompt,
        ai_temperature,
        webhook_url,
        is_active
    ) VALUES (
        _law_firm_id,
        _template.default_automation_name,
        _template.default_automation_description,
        _template.default_automation_trigger_type,
        _template.default_automation_trigger_config,
        _template.ai_prompt,
        _template.ai_temperature,
        '',
        true
    )
    RETURNING id INTO _automation_id;
    
    FOR _dept IN SELECT * FROM jsonb_array_elements(_template.default_departments)
    LOOP
        INSERT INTO public.departments (law_firm_id, name, color, icon, position)
        VALUES (
            _law_firm_id,
            _dept.value->>'name',
            _dept.value->>'color',
            _dept.value->>'icon',
            COALESCE((_dept.value->>'position')::integer, 0)
        );
    END LOOP;
    
    FOR _status IN SELECT * FROM jsonb_array_elements(_template.default_statuses)
    LOOP
        INSERT INTO public.custom_statuses (law_firm_id, name, color, position)
        VALUES (
            _law_firm_id,
            _status.value->>'name',
            _status.value->>'color',
            COALESCE((_status.value->>'position')::integer, 0)
        );
    END LOOP;
    
    FOR _tag IN SELECT * FROM jsonb_array_elements(_template.default_tags)
    LOOP
        INSERT INTO public.tags (law_firm_id, name, color)
        VALUES (
            _law_firm_id,
            _tag.value->>'name',
            _tag.value->>'color'
        );
    END LOOP;
    
    FOR _knowledge IN 
        SELECT * FROM public.template_knowledge_items 
        WHERE template_id = _template.id AND is_active = true
    LOOP
        INSERT INTO public.knowledge_items (
            law_firm_id,
            title,
            content,
            category,
            item_type,
            file_url,
            file_name,
            file_type,
            file_size
        ) VALUES (
            _law_firm_id,
            _knowledge.title,
            _knowledge.content,
            _knowledge.category,
            _knowledge.item_type,
            _knowledge.file_url,
            _knowledge.file_name,
            _knowledge.file_type,
            _knowledge.file_size
        );
    END LOOP;
    
    UPDATE public.companies
    SET 
        template_version = _template.version,
        template_cloned_at = now()
    WHERE id = _company_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'template_version', _template.version,
        'template_name', _template.name,
        'automation_id', _automation_id,
        'cloned_at', now()
    );
END;
$$;

-- 5. Fix unify_duplicate_conversations - add tenant validation
CREATE OR REPLACE FUNCTION public.unify_duplicate_conversations(_law_firm_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _group record;
  _duplicate record;
  _primary_id uuid;
  _deleted_count integer := 0;
  _unified_groups text[] := '{}';
  _effective_law_firm_id uuid;
  _caller_law_firm_id uuid;
BEGIN
  -- SECURITY: Validate caller
  _caller_law_firm_id := get_user_law_firm_id(auth.uid());
  
  -- If no law_firm_id provided, use caller's law_firm
  IF _law_firm_id IS NULL THEN
    _effective_law_firm_id := _caller_law_firm_id;
  ELSE
    _effective_law_firm_id := _law_firm_id;
  END IF;
  
  -- Validate access
  IF _caller_law_firm_id IS NULL AND NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  
  IF _effective_law_firm_id <> _caller_law_firm_id AND NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  FOR _group IN
    SELECT remote_jid, whatsapp_instance_id
    FROM public.conversations
    WHERE law_firm_id = _effective_law_firm_id
    GROUP BY remote_jid, whatsapp_instance_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO _primary_id
    FROM public.conversations
    WHERE law_firm_id = _effective_law_firm_id
      AND remote_jid = _group.remote_jid
      AND (whatsapp_instance_id IS NOT DISTINCT FROM _group.whatsapp_instance_id)
    ORDER BY created_at ASC
    LIMIT 1;

    FOR _duplicate IN
      SELECT id
      FROM public.conversations
      WHERE law_firm_id = _effective_law_firm_id
        AND remote_jid = _group.remote_jid
        AND (whatsapp_instance_id IS NOT DISTINCT FROM _group.whatsapp_instance_id)
        AND id != _primary_id
    LOOP
      UPDATE public.messages SET conversation_id = _primary_id WHERE conversation_id = _duplicate.id;
      DELETE FROM public.conversations WHERE id = _duplicate.id;
      _deleted_count := _deleted_count + 1;
    END LOOP;

    _unified_groups := array_append(
      _unified_groups, 
      _group.remote_jid || '|' || COALESCE(_group.whatsapp_instance_id::text, 'null')
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', _deleted_count,
    'unified_groups', _unified_groups
  );
END;
$$;
