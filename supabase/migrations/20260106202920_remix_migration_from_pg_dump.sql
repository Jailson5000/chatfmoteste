CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: admin_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.admin_role AS ENUM (
    'super_admin',
    'admin_operacional',
    'admin_financeiro'
);


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'gerente',
    'advogado',
    'estagiario',
    'atendente'
);


--
-- Name: case_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.case_status AS ENUM (
    'novo_contato',
    'triagem_ia',
    'aguardando_documentos',
    'em_analise',
    'em_andamento',
    'encerrado'
);


--
-- Name: legal_area; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.legal_area AS ENUM (
    'civil',
    'trabalhista',
    'penal',
    'familia',
    'consumidor',
    'empresarial',
    'tributario',
    'ambiental',
    'outros'
);


--
-- Name: message_handler; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_handler AS ENUM (
    'ai',
    'human'
);


--
-- Name: backup_automation_prompt(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.backup_automation_prompt() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only backup if ai_prompt is actually changing
  IF OLD.ai_prompt IS DISTINCT FROM NEW.ai_prompt THEN
    NEW.last_prompt := OLD.ai_prompt;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: cancel_follow_ups_on_client_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_follow_ups_on_client_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only for incoming messages (not from us)
  IF NEW.is_from_me = false THEN
    -- Cancel pending/processing follow-ups for this conversation
    UPDATE public.scheduled_follow_ups
    SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Client responded'
    WHERE conversation_id = NEW.conversation_id AND status IN ('pending', 'processing');
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: check_company_limit(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_company_limit(_law_firm_id uuid, _limit_type text, _increment integer DEFAULT 1) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _usage record;
  _current_value integer;
  _max_value integer;
  _buffer_max integer;
  _result jsonb;
BEGIN
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
  
  -- Buffer de 10% (uso interno)
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


--
-- Name: clone_template_for_company(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clone_template_for_company(_law_firm_id uuid, _company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
    -- Buscar template ativo
    SELECT * INTO _template
    FROM public.ai_template_base
    WHERE is_active = true
    ORDER BY version DESC
    LIMIT 1;
    
    IF _template IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhum template ativo encontrado');
    END IF;
    
    -- 1. Criar law_firm_settings baseado no template
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
    
    -- 2. Criar automação padrão
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
    
    -- 3. Criar departamentos padrão
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
    
    -- 4. Criar status padrão
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
    
    -- 5. Criar tags padrão
    FOR _tag IN SELECT * FROM jsonb_array_elements(_template.default_tags)
    LOOP
        INSERT INTO public.tags (law_firm_id, name, color)
        VALUES (
            _law_firm_id,
            _tag.value->>'name',
            _tag.value->>'color'
        );
    END LOOP;
    
    -- 6. Clonar itens de conhecimento do template
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
    
    -- 7. Atualizar company com versão do template
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


--
-- Name: create_tray_sync_state(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_tray_sync_state() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    INSERT INTO public.tray_commerce_sync_state (connection_id)
    VALUES (NEW.id)
    ON CONFLICT (connection_id) DO NOTHING;
    RETURN NEW;
END;
$$;


--
-- Name: ensure_single_default_evolution_connection(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_single_default_evolution_connection() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.evolution_api_connections
    SET is_default = false
    WHERE id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: ensure_single_default_tray_connection(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_single_default_tray_connection() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE public.tray_commerce_connections
        SET is_default = false
        WHERE law_firm_id = NEW.law_firm_id AND id != NEW.id AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: get_admin_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_role(_user_id uuid) RETURNS public.admin_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT role
    FROM public.admin_user_roles
    WHERE user_id = _user_id
    LIMIT 1
$$;


--
-- Name: get_law_firm_by_subdomain(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_law_firm_by_subdomain(_subdomain text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT id
    FROM public.law_firms
    WHERE subdomain = _subdomain
$$;


--
-- Name: get_user_law_firm_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_law_firm_id(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT law_firm_id
    FROM public.profiles
    WHERE id = _user_id
$$;


--
-- Name: handle_new_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    is_first_user BOOLEAN;
BEGIN
    -- Check if this is the first user in the law firm
    SELECT NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE law_firm_id = NEW.law_firm_id 
        AND id != NEW.id
    ) INTO is_first_user;
    
    -- Assign role based on whether this is the first user
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
        IF is_first_user THEN
            -- First user of the law firm gets admin role
            INSERT INTO public.user_roles (user_id, role)
            VALUES (NEW.id, 'admin');
        ELSE
            -- Subsequent users get atendente role
            INSERT INTO public.user_roles (user_id, role)
            VALUES (NEW.id, 'atendente');
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    -- Only create profile if it doesn't already exist
    -- The law_firm_id should be set by the provisioning process (create-company-admin)
    -- If a user is created without going through provisioning, they won't have a law_firm_id
    -- and will be blocked by the security checks in ProtectedRoute/useCompanyApproval
    INSERT INTO public.profiles (id, full_name, email, law_firm_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email,
        -- law_firm_id will be NULL unless set via provisioning
        (NEW.raw_user_meta_data->>'law_firm_id')::uuid
    )
    ON CONFLICT (id) DO NOTHING;
    
    RETURN NEW;
END;
$$;


--
-- Name: has_admin_role(uuid, public.admin_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_admin_role(_user_id uuid, _role public.admin_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_user_roles
        WHERE user_id = _user_id
    )
$$;


--
-- Name: mark_messages_as_read(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_messages_as_read(_conversation_id uuid, _user_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: normalize_phone(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_phone(phone text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT regexp_replace(phone, '\D', '', 'g')
$$;


--
-- Name: schedule_follow_ups_on_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.schedule_follow_ups_on_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _follow_up record;
  _delay_minutes integer;
  _conversation record;
BEGIN
  -- Only trigger if status actually changed and new status is not null
  IF OLD.custom_status_id IS DISTINCT FROM NEW.custom_status_id AND NEW.custom_status_id IS NOT NULL THEN
    -- Cancel any pending/processing follow-ups for this client
    UPDATE public.scheduled_follow_ups
    SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Status changed'
    WHERE client_id = NEW.id AND status IN ('pending','processing');

    -- Get the most recent conversation for this client (even if archived)
    SELECT * INTO _conversation
    FROM public.conversations
    WHERE client_id = NEW.id AND law_firm_id = NEW.law_firm_id
    ORDER BY last_message_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

    IF _conversation IS NOT NULL THEN
      FOR _follow_up IN
        SELECT * FROM public.status_follow_ups
        WHERE status_id = NEW.custom_status_id
          AND is_active = true
        ORDER BY position ASC
      LOOP
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
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail original UPDATE
    RETURN NEW;
END;
$$;


--
-- Name: toggle_admin_active(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_admin_active(_target_user_id uuid, _is_active boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _caller_id uuid;
  _caller_role admin_role;
  _old_status boolean;
  _target_email text;
  _caller_email text;
BEGIN
  -- Get the calling user's ID
  _caller_id := auth.uid();
  
  IF _caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Prevent self-deactivation
  IF _caller_id = _target_user_id AND _is_active = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot deactivate yourself');
  END IF;

  -- Get caller's role
  SELECT role INTO _caller_role
  FROM public.admin_user_roles
  WHERE user_id = _caller_id;

  IF _caller_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caller is not an admin');
  END IF;

  -- Only super_admin can toggle active status
  IF _caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin can change admin status');
  END IF;

  -- Get target info
  SELECT is_active, email INTO _old_status, _target_email
  FROM public.admin_profiles
  WHERE user_id = _target_user_id;

  SELECT email INTO _caller_email
  FROM public.admin_profiles
  WHERE user_id = _caller_id;

  IF _target_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target admin not found');
  END IF;

  -- Update status
  UPDATE public.admin_profiles
  SET is_active = _is_active
  WHERE user_id = _target_user_id;

  -- Log the change
  INSERT INTO public.audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) VALUES (
    _caller_id,
    CASE WHEN _is_active THEN 'ADMIN_ACTIVATED' ELSE 'ADMIN_DEACTIVATED' END,
    'admin_user',
    _target_user_id,
    jsonb_build_object('is_active', _old_status, 'email', _target_email),
    jsonb_build_object('is_active', _is_active, 'changed_by', _caller_email)
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_status', _old_status,
    'new_status', _is_active,
    'target_email', _target_email
  );
END;
$$;


--
-- Name: track_instance_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_instance_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    -- Only track if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Record the status change
        INSERT INTO public.instance_status_history (instance_id, status, previous_status, changed_at)
        VALUES (NEW.id, NEW.status, OLD.status, NOW());
        
        -- Update disconnected_since tracking
        IF NEW.status IN ('disconnected', 'error', 'suspended') AND OLD.status = 'connected' THEN
            NEW.disconnected_since := NOW();
        ELSIF NEW.status = 'connected' THEN
            NEW.disconnected_since := NULL;
            NEW.last_alert_sent_at := NULL;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: unify_duplicate_clients(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unify_duplicate_clients(_law_firm_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _phone_normalized text;
  _duplicate record;
  _primary_id uuid;
  _deleted_count integer := 0;
  _unified_phones text[] := '{}';
BEGIN
  -- Para cada telefone duplicado no tenant
  FOR _phone_normalized IN
    SELECT normalize_phone(phone)
    FROM public.clients
    WHERE law_firm_id = _law_firm_id
    GROUP BY normalize_phone(phone)
    HAVING COUNT(*) > 1
  LOOP
    -- Pegar o mais antigo como primário
    SELECT id INTO _primary_id
    FROM public.clients
    WHERE law_firm_id = _law_firm_id
      AND normalize_phone(phone) = _phone_normalized
    ORDER BY created_at ASC
    LIMIT 1;
    
    -- Transferir referências dos duplicados para o primário
    FOR _duplicate IN
      SELECT id FROM public.clients
      WHERE law_firm_id = _law_firm_id
        AND normalize_phone(phone) = _phone_normalized
        AND id != _primary_id
    LOOP
      -- Atualizar conversations para apontar pro primário
      UPDATE public.conversations SET client_id = _primary_id WHERE client_id = _duplicate.id;
      -- Atualizar client_tags
      UPDATE public.client_tags SET client_id = _primary_id WHERE client_id = _duplicate.id;
      -- Atualizar client_actions
      UPDATE public.client_actions SET client_id = _primary_id WHERE client_id = _duplicate.id;
      -- Atualizar client_memories
      UPDATE public.client_memories SET client_id = _primary_id WHERE client_id = _duplicate.id;
      -- Atualizar cases
      UPDATE public.cases SET client_id = _primary_id WHERE client_id = _duplicate.id;
      -- Atualizar documents
      UPDATE public.documents SET client_id = _primary_id WHERE client_id = _duplicate.id;
      -- Atualizar google_calendar_events
      UPDATE public.google_calendar_events SET client_id = _primary_id WHERE client_id = _duplicate.id;
      
      -- Deletar o duplicado
      DELETE FROM public.clients WHERE id = _duplicate.id;
      _deleted_count := _deleted_count + 1;
    END LOOP;
    
    _unified_phones := array_append(_unified_phones, _phone_normalized);
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', _deleted_count,
    'unified_phones', _unified_phones
  );
END;
$$;


--
-- Name: update_admin_role(uuid, public.admin_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_admin_role(_target_user_id uuid, _new_role public.admin_role) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _caller_id uuid;
  _caller_role admin_role;
  _old_role admin_role;
  _target_email text;
  _caller_email text;
BEGIN
  -- Get the calling user's ID
  _caller_id := auth.uid();
  
  IF _caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get caller's role
  SELECT role INTO _caller_role
  FROM public.admin_user_roles
  WHERE user_id = _caller_id;

  IF _caller_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caller is not an admin');
  END IF;

  -- Only super_admin can change roles
  IF _caller_role != 'super_admin' THEN
    -- Log unauthorized attempt
    INSERT INTO public.audit_logs (
      admin_user_id, 
      action, 
      entity_type, 
      entity_id, 
      new_values
    ) VALUES (
      _caller_id,
      'ROLE_CHANGE_DENIED',
      'admin_security',
      _target_user_id,
      jsonb_build_object(
        'caller_role', _caller_role,
        'attempted_role', _new_role,
        'reason', 'Only super_admin can change roles'
      )
    );

    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin can change roles');
  END IF;

  -- Get target user's current role and email
  SELECT role INTO _old_role
  FROM public.admin_user_roles
  WHERE user_id = _target_user_id;

  SELECT email INTO _target_email
  FROM public.admin_profiles
  WHERE user_id = _target_user_id;

  SELECT email INTO _caller_email
  FROM public.admin_profiles
  WHERE user_id = _caller_id;

  -- Prevent demoting the last super_admin
  IF _old_role = 'super_admin' AND _new_role != 'super_admin' THEN
    IF (SELECT COUNT(*) FROM public.admin_user_roles WHERE role = 'super_admin') <= 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot remove the last super_admin');
    END IF;
  END IF;

  -- Update or insert the role
  IF _old_role IS NOT NULL THEN
    UPDATE public.admin_user_roles
    SET role = _new_role
    WHERE user_id = _target_user_id;
  ELSE
    INSERT INTO public.admin_user_roles (user_id, role)
    VALUES (_target_user_id, _new_role);
  END IF;

  -- Log successful role change
  INSERT INTO public.audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) VALUES (
    _caller_id,
    'ADMIN_ROLE_CHANGED',
    'admin_user',
    _target_user_id,
    jsonb_build_object('role', _old_role, 'email', _target_email),
    jsonb_build_object('role', _new_role, 'changed_by', _caller_email)
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_role', _old_role,
    'new_role', _new_role,
    'target_email', _target_email
  );
END;
$$;


--
-- Name: update_client_status_with_follow_ups(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_client_status_with_follow_ups(_client_id uuid, _new_status_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _old_status_id uuid;
  _client_law_firm_id uuid;
  _conversation_id uuid;
  _follow_up record;
  _delay_minutes integer;
  _insert_count integer := 0;
BEGIN
  -- Get current status and law_firm_id
  SELECT custom_status_id, law_firm_id INTO _old_status_id, _client_law_firm_id 
  FROM public.clients WHERE id = _client_id;
  
  IF _client_law_firm_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;

  -- Get conversation ID (most recent, even if archived)
  SELECT id INTO _conversation_id
  FROM public.conversations
  WHERE client_id = _client_id AND law_firm_id = _client_law_firm_id
  ORDER BY last_message_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  -- Update the client status
  UPDATE public.clients SET custom_status_id = _new_status_id WHERE id = _client_id;

  -- If status didn't change or new status null, just cancel follow-ups and return
  IF NOT (_old_status_id IS DISTINCT FROM _new_status_id) THEN
    RETURN jsonb_build_object('success', true, 'message', 'Status unchanged');
  END IF;

  -- Cancel pending/processing follow-ups
  UPDATE public.scheduled_follow_ups
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Status changed'
  WHERE client_id = _client_id AND status IN ('pending', 'processing');

  IF _new_status_id IS NULL OR _conversation_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'old_status', _old_status_id,
      'new_status', _new_status_id,
      'conversation_id', _conversation_id,
      'follow_ups_created', 0
    );
  END IF;

  -- Schedule new follow-ups
  FOR _follow_up IN
    SELECT * FROM public.status_follow_ups
    WHERE status_id = _new_status_id AND is_active = true
    ORDER BY position ASC
  LOOP
    _delay_minutes := CASE _follow_up.delay_unit
      WHEN 'hour' THEN _follow_up.delay_minutes * 60
      WHEN 'day' THEN _follow_up.delay_minutes * 60 * 24
      ELSE _follow_up.delay_minutes
    END;
    
    INSERT INTO public.scheduled_follow_ups (
      law_firm_id, client_id, conversation_id, follow_up_rule_id, template_id, scheduled_at, status
    ) VALUES (
      _client_law_firm_id, _client_id, _conversation_id, _follow_up.id, _follow_up.template_id,
      now() + (_delay_minutes || ' minutes')::interval, 'pending'
    );
    
    _insert_count := _insert_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'old_status', _old_status_id,
    'new_status', _new_status_id,
    'conversation_id', _conversation_id,
    'follow_ups_created', _insert_count
  );
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: user_belongs_to_law_firm(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_belongs_to_law_firm(_user_id uuid, _law_firm_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = _user_id
          AND law_firm_id = _law_firm_id
    )
$$;


--
-- Name: validate_agent_knowledge_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_agent_knowledge_tenant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  automation_tenant uuid;
  knowledge_tenant uuid;
BEGIN
  -- Buscar tenant da automação
  SELECT law_firm_id INTO automation_tenant
  FROM public.automations WHERE id = NEW.automation_id;
  
  -- Buscar tenant do knowledge item
  SELECT law_firm_id INTO knowledge_tenant
  FROM public.knowledge_items WHERE id = NEW.knowledge_item_id;
  
  -- Validar que todos pertencem ao mesmo tenant
  IF automation_tenant IS NULL OR knowledge_tenant IS NULL THEN
    RAISE EXCEPTION 'Automation or Knowledge Item not found';
  END IF;
  
  IF automation_tenant != knowledge_tenant THEN
    RAISE EXCEPTION 'Cross-tenant linking not allowed: automation belongs to % but knowledge belongs to %', 
      automation_tenant, knowledge_tenant;
  END IF;
  
  IF NEW.law_firm_id != automation_tenant THEN
    RAISE EXCEPTION 'law_firm_id mismatch: provided % but automation belongs to %',
      NEW.law_firm_id, automation_tenant;
  END IF;
  
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: admin_notification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_notification_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    tenant_id uuid,
    company_name text,
    event_key text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    email_sent_to text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    avatar_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.admin_role DEFAULT 'admin_operacional'::public.admin_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    law_firm_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_knowledge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_knowledge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    automation_id uuid NOT NULL,
    knowledge_item_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    law_firm_id uuid NOT NULL
);


--
-- Name: agent_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    icon text DEFAULT 'bot'::text,
    ai_prompt text NOT NULL,
    ai_temperature numeric DEFAULT 0.7,
    response_delay_seconds integer DEFAULT 2,
    trigger_type text DEFAULT 'message_received'::text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb,
    voice_enabled boolean DEFAULT false,
    voice_id text,
    category text DEFAULT 'geral'::text,
    tags text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true NOT NULL,
    is_featured boolean DEFAULT false,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    usage_count integer DEFAULT 0
);


--
-- Name: ai_template_base; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_template_base (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    name text DEFAULT 'Template Padrão'::text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    ai_provider text DEFAULT 'internal'::text NOT NULL,
    ai_prompt text,
    ai_temperature numeric DEFAULT 0.7,
    response_delay_seconds integer DEFAULT 2,
    ai_capabilities jsonb DEFAULT '{"summary": true, "auto_reply": true, "transcription": true, "classification": true}'::jsonb,
    default_automation_name text DEFAULT 'Atendente IA'::text,
    default_automation_description text DEFAULT 'Agente de IA para atendimento automatizado'::text,
    default_automation_trigger_type text DEFAULT 'message_received'::text,
    default_automation_trigger_config jsonb DEFAULT '{}'::jsonb,
    default_departments jsonb DEFAULT '[{"icon": "headphones", "name": "Atendimento", "color": "#3B82F6"}, {"icon": "shopping-cart", "name": "Vendas", "color": "#10B981"}, {"icon": "life-buoy", "name": "Suporte", "color": "#F59E0B"}]'::jsonb,
    default_statuses jsonb DEFAULT '[{"name": "Novo", "color": "#6366F1", "position": 0}, {"name": "Em Atendimento", "color": "#F59E0B", "position": 1}, {"name": "Aguardando Cliente", "color": "#EF4444", "position": 2}, {"name": "Concluído", "color": "#10B981", "position": 3}]'::jsonb,
    default_tags jsonb DEFAULT '[{"name": "Urgente", "color": "#EF4444"}, {"name": "VIP", "color": "#F59E0B"}, {"name": "Novo Cliente", "color": "#10B981"}]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);


--
-- Name: ai_template_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_template_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    version integer NOT NULL,
    template_snapshot jsonb NOT NULL,
    knowledge_items_snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    notes text
);


--
-- Name: ai_transfer_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_transfer_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    from_agent_id uuid,
    to_agent_id uuid NOT NULL,
    from_agent_name text,
    to_agent_name text NOT NULL,
    transferred_by uuid,
    transferred_by_name text,
    transfer_type text DEFAULT 'manual'::text NOT NULL,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    transferred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    admin_user_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    webhook_url text NOT NULL,
    trigger_type text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb,
    ai_prompt text,
    ai_temperature numeric(2,1) DEFAULT 0.7,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_prompt text,
    folder_id uuid,
    "position" integer DEFAULT 0 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    notify_on_transfer boolean DEFAULT false NOT NULL,
    CONSTRAINT webhook_url_https_only CHECK (((webhook_url = ''::text) OR ((webhook_url ~ '^https://[a-zA-Z0-9][a-zA-Z0-9\-]*(\.[a-zA-Z0-9\-]+)+(/.*)?$'::text) AND (webhook_url !~~ '%localhost%'::text) AND (webhook_url !~~ '%127.0.0.1%'::text) AND (webhook_url !~~ '%10.%'::text) AND (webhook_url !~~ '%172.16.%'::text) AND (webhook_url !~~ '%172.17.%'::text) AND (webhook_url !~~ '%172.18.%'::text) AND (webhook_url !~~ '%172.19.%'::text) AND (webhook_url !~~ '%172.2_.%'::text) AND (webhook_url !~~ '%172.30.%'::text) AND (webhook_url !~~ '%172.31.%'::text) AND (webhook_url !~~ '%192.168.%'::text) AND (webhook_url !~~ '%0.0.0.0%'::text))))
);


--
-- Name: cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    client_id uuid,
    conversation_id uuid,
    assigned_to uuid,
    title text NOT NULL,
    description text,
    legal_area public.legal_area DEFAULT 'outros'::public.legal_area NOT NULL,
    status public.case_status DEFAULT 'novo_contato'::public.case_status NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    case_number text,
    ai_summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    client_id uuid NOT NULL,
    action_type text NOT NULL,
    from_value text,
    to_value text,
    description text,
    performed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_memories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    law_firm_id uuid NOT NULL,
    fact_type text NOT NULL,
    content text NOT NULL,
    source_conversation_id uuid,
    importance integer DEFAULT 5,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    document text,
    address text,
    notes text,
    lgpd_consent boolean DEFAULT false NOT NULL,
    lgpd_consent_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_status_id uuid,
    department_id uuid,
    state text,
    avatar_url text
);

ALTER TABLE ONLY public.clients REPLICA IDENTITY FULL;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid,
    name text NOT NULL,
    document text,
    email text,
    phone text,
    plan_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    max_users integer DEFAULT 5,
    max_instances integer DEFAULT 2,
    trial_ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    n8n_workflow_id text,
    n8n_workflow_name text,
    n8n_workflow_status text DEFAULT 'pending'::text,
    n8n_last_error text,
    n8n_created_at timestamp with time zone,
    n8n_updated_at timestamp with time zone,
    client_app_status text DEFAULT 'pending'::text NOT NULL,
    provisioning_status text DEFAULT 'pending'::text NOT NULL,
    n8n_retry_count integer DEFAULT 0 NOT NULL,
    n8n_next_retry_at timestamp with time zone,
    last_health_check_at timestamp with time zone,
    health_status text DEFAULT 'unknown'::text,
    admin_user_id uuid,
    initial_access_email_sent boolean DEFAULT false,
    initial_access_email_sent_at timestamp with time zone,
    initial_access_email_error text,
    approval_status text DEFAULT 'approved'::text NOT NULL,
    rejection_reason text,
    approved_at timestamp with time zone,
    approved_by uuid,
    rejected_at timestamp with time zone,
    rejected_by uuid,
    template_version integer DEFAULT 1,
    template_cloned_at timestamp with time zone,
    use_custom_limits boolean DEFAULT false NOT NULL,
    max_agents integer,
    max_workspaces integer,
    max_ai_conversations integer,
    max_tts_minutes integer,
    CONSTRAINT companies_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending_approval'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    client_id uuid,
    whatsapp_instance_id uuid,
    assigned_to uuid,
    remote_jid text NOT NULL,
    contact_name text,
    contact_phone text,
    current_handler public.message_handler DEFAULT 'ai'::public.message_handler NOT NULL,
    status public.case_status DEFAULT 'novo_contato'::public.case_status NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    internal_notes text,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    department_id uuid,
    ai_summary text,
    needs_human_handoff boolean DEFAULT false,
    n8n_last_response_at timestamp with time zone,
    last_summarized_at timestamp with time zone,
    summary_message_count integer DEFAULT 0,
    origin text DEFAULT 'whatsapp'::text,
    origin_metadata jsonb DEFAULT '{}'::jsonb,
    ai_audio_enabled boolean DEFAULT false,
    ai_audio_enabled_by text,
    ai_audio_last_enabled_at timestamp with time zone,
    ai_audio_last_disabled_at timestamp with time zone,
    current_automation_id uuid,
    archived_at timestamp with time zone,
    archived_reason text,
    archived_next_responsible_type text,
    archived_next_responsible_id uuid
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_id uuid,
    content text,
    message_type text DEFAULT 'text'::text NOT NULL,
    media_url text,
    media_mime_type text,
    is_from_me boolean DEFAULT false NOT NULL,
    whatsapp_message_id text,
    ai_generated boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    reply_to_message_id uuid,
    delivered_at timestamp with time zone,
    status text DEFAULT 'sent'::text,
    is_internal boolean DEFAULT false NOT NULL,
    ai_agent_id uuid,
    ai_agent_name text
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    billing_period text DEFAULT 'monthly'::text NOT NULL,
    max_users integer DEFAULT 5,
    max_instances integer DEFAULT 2,
    max_messages integer,
    features jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    max_ai_conversations integer DEFAULT 250,
    max_tts_minutes integer DEFAULT 40,
    max_agents integer DEFAULT 1,
    max_workspaces integer DEFAULT 1
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    law_firm_id uuid,
    full_name text NOT NULL,
    email text NOT NULL,
    phone text,
    avatar_url text,
    oab_number text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notification_sound_enabled boolean DEFAULT true NOT NULL,
    notification_browser_enabled boolean DEFAULT true NOT NULL,
    job_title text,
    must_change_password boolean DEFAULT false NOT NULL
);


--
-- Name: usage_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    usage_type text NOT NULL,
    count integer DEFAULT 1 NOT NULL,
    duration_seconds integer,
    billing_period text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    instance_name text NOT NULL,
    instance_id text,
    api_url text NOT NULL,
    api_key text,
    phone_number text,
    status text DEFAULT 'disconnected'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    api_key_encrypted boolean DEFAULT false,
    last_webhook_event text,
    last_webhook_at timestamp with time zone,
    default_department_id uuid,
    default_status_id uuid,
    default_assigned_to uuid,
    disconnected_since timestamp with time zone,
    last_alert_sent_at timestamp with time zone,
    display_name text,
    default_automation_id uuid
);


--
-- Name: company_usage_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.company_usage_summary WITH (security_invoker='true') AS
 SELECT c.id AS company_id,
    c.law_firm_id,
    c.name AS company_name,
    c.plan_id,
    p.name AS plan_name,
    c.use_custom_limits,
        CASE
            WHEN (c.use_custom_limits AND (c.max_users IS NOT NULL)) THEN c.max_users
            ELSE COALESCE(p.max_users, 5)
        END AS effective_max_users,
        CASE
            WHEN (c.use_custom_limits AND (c.max_instances IS NOT NULL)) THEN c.max_instances
            ELSE COALESCE(p.max_instances, 2)
        END AS effective_max_instances,
        CASE
            WHEN (c.use_custom_limits AND (c.max_agents IS NOT NULL)) THEN c.max_agents
            ELSE COALESCE(p.max_agents, 1)
        END AS effective_max_agents,
        CASE
            WHEN (c.use_custom_limits AND (c.max_workspaces IS NOT NULL)) THEN c.max_workspaces
            ELSE COALESCE(p.max_workspaces, 1)
        END AS effective_max_workspaces,
        CASE
            WHEN (c.use_custom_limits AND (c.max_ai_conversations IS NOT NULL)) THEN c.max_ai_conversations
            ELSE COALESCE(p.max_ai_conversations, 250)
        END AS effective_max_ai_conversations,
        CASE
            WHEN (c.use_custom_limits AND (c.max_tts_minutes IS NOT NULL)) THEN c.max_tts_minutes
            ELSE COALESCE(p.max_tts_minutes, 40)
        END AS effective_max_tts_minutes,
    ( SELECT count(*) AS count
           FROM public.profiles pr
          WHERE (pr.law_firm_id = c.law_firm_id)) AS current_users,
    ( SELECT count(*) AS count
           FROM public.whatsapp_instances wi
          WHERE (wi.law_firm_id = c.law_firm_id)) AS current_instances,
    ( SELECT count(*) AS count
           FROM public.automations a
          WHERE (a.law_firm_id = c.law_firm_id)) AS current_agents,
    ( SELECT COALESCE(NULLIF(( SELECT COALESCE(sum(ur.count), (0)::bigint) AS "coalesce"
                   FROM public.usage_records ur
                  WHERE ((ur.law_firm_id = c.law_firm_id) AND (ur.usage_type = 'ai_conversation'::text) AND (ur.billing_period = to_char(now(), 'YYYY-MM'::text)))), 0), ( SELECT count(DISTINCT conv.id) AS count
                   FROM (public.conversations conv
                     JOIN public.messages m ON ((m.conversation_id = conv.id)))
                  WHERE ((conv.law_firm_id = c.law_firm_id) AND (m.ai_generated = true) AND (m.created_at >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))))) AS "coalesce") AS current_ai_conversations,
    ( SELECT COALESCE(round(((sum(ur.duration_seconds))::numeric / 60.0), 2), (0)::numeric) AS "coalesce"
           FROM public.usage_records ur
          WHERE ((ur.law_firm_id = c.law_firm_id) AND (ur.usage_type = 'tts_audio'::text) AND (ur.billing_period = to_char(now(), 'YYYY-MM'::text)))) AS current_tts_minutes
   FROM (public.companies c
     LEFT JOIN public.plans p ON ((c.plan_id = p.id)))
  WHERE (c.law_firm_id IS NOT NULL);


--
-- Name: consent_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    consent_type text NOT NULL,
    granted boolean NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: custom_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_statuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    description text
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    icon text DEFAULT 'folder'::text,
    "position" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    client_id uuid,
    conversation_id uuid,
    name text NOT NULL,
    file_url text NOT NULL,
    file_type text,
    file_size integer,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: evolution_api_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evolution_api_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    api_url text NOT NULL,
    api_key text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    last_health_check_at timestamp with time zone,
    health_status text DEFAULT 'unknown'::text,
    health_latency_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: google_calendar_ai_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_calendar_ai_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    action_type text NOT NULL,
    event_id text,
    event_title text,
    event_start timestamp with time zone,
    event_end timestamp with time zone,
    ai_agent_id uuid,
    conversation_id uuid,
    client_id uuid,
    request_description text,
    response_summary text,
    success boolean DEFAULT true NOT NULL,
    error_message text,
    performed_by text DEFAULT 'ai'::text NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: google_calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    google_event_id text NOT NULL,
    calendar_id text NOT NULL,
    title text NOT NULL,
    description text,
    location text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    timezone text DEFAULT 'America/Sao_Paulo'::text,
    is_all_day boolean DEFAULT false,
    status text DEFAULT 'confirmed'::text,
    attendees jsonb DEFAULT '[]'::jsonb,
    recurrence_rule text,
    recurring_event_id text,
    html_link text,
    meet_link text,
    client_id uuid,
    conversation_id uuid,
    created_by_ai boolean DEFAULT false,
    etag text,
    last_synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: google_calendar_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_calendar_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    token_expires_at timestamp with time zone NOT NULL,
    google_email text NOT NULL,
    google_account_id text,
    default_calendar_id text,
    default_calendar_name text,
    allow_read_events boolean DEFAULT true NOT NULL,
    allow_create_events boolean DEFAULT true NOT NULL,
    allow_edit_events boolean DEFAULT true NOT NULL,
    allow_delete_events boolean DEFAULT false NOT NULL,
    last_sync_at timestamp with time zone,
    next_sync_at timestamp with time zone,
    sync_token text,
    is_active boolean DEFAULT true NOT NULL,
    connected_by uuid,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instance_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id uuid NOT NULL,
    status text NOT NULL,
    previous_status text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kanban_columns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanban_columns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    name text NOT NULL,
    status public.case_status NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    title text NOT NULL,
    content text,
    category text DEFAULT 'other'::text NOT NULL,
    item_type text DEFAULT 'text'::text NOT NULL,
    file_url text,
    file_name text,
    file_type text,
    file_size integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: law_firm_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.law_firm_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    evolution_api_url text,
    evolution_api_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_provider text DEFAULT 'internal'::text NOT NULL,
    openai_api_key text,
    ai_capabilities jsonb DEFAULT '{"summary": true, "auto_reply": true, "transcription": true, "classification": true}'::jsonb,
    n8n_webhook_url text,
    n8n_webhook_secret text,
    n8n_last_test_at timestamp with time zone,
    n8n_last_test_status text,
    openai_last_test_at timestamp with time zone,
    openai_last_test_status text,
    ai_settings_updated_by uuid,
    ai_settings_updated_at timestamp with time zone DEFAULT now(),
    ai_voice_enabled boolean DEFAULT false,
    ai_voice_id text DEFAULT 'camila'::text,
    default_automation_id uuid,
    CONSTRAINT law_firm_settings_ai_provider_check CHECK ((ai_provider = ANY (ARRAY['internal'::text, 'n8n'::text, 'openai'::text])))
);


--
-- Name: law_firms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.law_firms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    document text,
    phone text,
    email text,
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    logo_url text,
    phone2 text,
    subdomain text,
    oab_number text,
    instagram text,
    facebook text,
    website text,
    business_hours jsonb DEFAULT '{"friday": {"end": "18:00", "start": "08:00", "enabled": true}, "monday": {"end": "18:00", "start": "08:00", "enabled": true}, "sunday": {"end": "12:00", "start": "08:00", "enabled": false}, "tuesday": {"end": "18:00", "start": "08:00", "enabled": true}, "saturday": {"end": "12:00", "start": "08:00", "enabled": false}, "thursday": {"end": "18:00", "start": "08:00", "enabled": true}, "wednesday": {"end": "18:00", "start": "08:00", "enabled": true}}'::jsonb,
    CONSTRAINT valid_subdomain_format CHECK (((subdomain IS NULL) OR (subdomain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'::text)))
);


--
-- Name: member_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id uuid NOT NULL,
    department_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    admin_user_id uuid,
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'info'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: scheduled_follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    client_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    follow_up_rule_id uuid NOT NULL,
    template_id uuid,
    scheduled_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone
);


--
-- Name: status_follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.status_follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status_id uuid NOT NULL,
    law_firm_id uuid NOT NULL,
    template_id uuid,
    delay_minutes integer DEFAULT 30 NOT NULL,
    delay_unit text DEFAULT 'min'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    give_up_on_no_response boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    give_up_status_id uuid
);


--
-- Name: system_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    metric_name text NOT NULL,
    metric_value numeric(15,2) NOT NULL,
    metric_type text DEFAULT 'gauge'::text NOT NULL,
    tags jsonb DEFAULT '{}'::jsonb,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    category text DEFAULT 'general'::text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: template_knowledge_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_knowledge_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    title text NOT NULL,
    content text,
    category text DEFAULT 'general'::text NOT NULL,
    item_type text DEFAULT 'text'::text NOT NULL,
    file_url text,
    file_name text,
    file_type text,
    file_size integer,
    "position" integer DEFAULT 0,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    name text NOT NULL,
    shortcut text NOT NULL,
    content text NOT NULL,
    category text DEFAULT 'geral'::text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    media_url text,
    media_type text
);


--
-- Name: tray_chat_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tray_chat_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    action text NOT NULL,
    performed_by uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tray_chat_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tray_chat_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    widget_key text NOT NULL,
    widget_color text DEFAULT '#6366f1'::text,
    widget_position text DEFAULT 'right'::text,
    welcome_message text DEFAULT 'Olá! Como posso ajudar?'::text,
    offline_message text DEFAULT 'No momento estamos offline. Deixe sua mensagem!'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    activated_at timestamp with time zone,
    activated_by uuid,
    deactivated_at timestamp with time zone,
    deactivated_by uuid,
    first_use_at timestamp with time zone,
    default_department_id uuid,
    default_status_id uuid,
    default_automation_id uuid
);


--
-- Name: tray_commerce_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tray_commerce_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid,
    law_firm_id uuid NOT NULL,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    old_values jsonb,
    new_values jsonb,
    performed_by uuid,
    source text DEFAULT 'user'::text,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tray_commerce_audit_logs_source_check CHECK ((source = ANY (ARRAY['user'::text, 'automation'::text, 'ai'::text, 'webhook'::text, 'sync'::text])))
);


--
-- Name: tray_commerce_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tray_commerce_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    store_name text NOT NULL,
    store_url text NOT NULL,
    tray_store_id text,
    api_address text,
    consumer_key text,
    consumer_secret text,
    access_token text,
    refresh_token text,
    token_expires_at timestamp with time zone,
    is_active boolean DEFAULT false NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    sync_products boolean DEFAULT true NOT NULL,
    sync_orders boolean DEFAULT true NOT NULL,
    sync_customers boolean DEFAULT true NOT NULL,
    sync_coupons boolean DEFAULT true NOT NULL,
    sync_shipping boolean DEFAULT true NOT NULL,
    read_only_mode boolean DEFAULT false NOT NULL,
    connection_status text DEFAULT 'disconnected'::text NOT NULL,
    last_error text,
    connected_at timestamp with time zone,
    connected_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tray_commerce_connections_connection_status_check CHECK ((connection_status = ANY (ARRAY['disconnected'::text, 'connected'::text, 'error'::text, 'token_expired'::text])))
);


--
-- Name: tray_commerce_sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tray_commerce_sync_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    last_products_sync_at timestamp with time zone,
    last_orders_sync_at timestamp with time zone,
    last_customers_sync_at timestamp with time zone,
    last_coupons_sync_at timestamp with time zone,
    last_shipping_sync_at timestamp with time zone,
    last_webhook_at timestamp with time zone,
    products_synced_count integer DEFAULT 0,
    orders_synced_count integer DEFAULT 0,
    customers_synced_count integer DEFAULT 0,
    coupons_synced_count integer DEFAULT 0,
    sync_in_progress boolean DEFAULT false,
    sync_started_at timestamp with time zone,
    last_sync_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tray_commerce_webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tray_commerce_webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid,
    law_firm_id uuid,
    event_type text NOT NULL,
    payload_summary jsonb,
    raw_payload jsonb,
    processed boolean DEFAULT false,
    processed_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tray_coupon_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tray_coupon_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    tray_coupon_id text NOT NULL,
    local_coupon_id uuid,
    tray_coupon_data jsonb,
    code text,
    discount_type text,
    discount_value numeric(10,2),
    min_value numeric(10,2),
    max_uses integer,
    uses_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    last_synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tray_customer_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tray_customer_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    tray_customer_id text NOT NULL,
    local_client_id uuid,
    tray_customer_data jsonb,
    name text,
    email text,
    phone text,
    document text,
    last_synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tray_order_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tray_order_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    tray_order_id text NOT NULL,
    local_conversation_id uuid,
    tray_order_data jsonb,
    order_number text,
    customer_name text,
    customer_email text,
    customer_phone text,
    total numeric(10,2),
    subtotal numeric(10,2),
    shipping_value numeric(10,2),
    discount numeric(10,2),
    tray_status text,
    local_status text,
    payment_method text,
    shipping_method text,
    tracking_code text,
    tracking_url text,
    shipping_address jsonb,
    items jsonb,
    order_date timestamp with time zone,
    last_synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tray_product_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tray_product_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    tray_product_id text NOT NULL,
    local_product_id uuid,
    tray_product_data jsonb,
    name text,
    sku text,
    price numeric(10,2),
    stock integer,
    is_active boolean DEFAULT true,
    last_synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: usage_history_monthly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_history_monthly (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    law_firm_id uuid NOT NULL,
    billing_period text NOT NULL,
    ai_conversations integer DEFAULT 0,
    tts_minutes numeric DEFAULT 0,
    transcriptions integer DEFAULT 0,
    max_users_snapshot integer,
    max_instances_snapshot integer,
    max_agents_snapshot integer,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'atendente'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    automation_id uuid,
    direction text NOT NULL,
    payload jsonb NOT NULL,
    response jsonb,
    status_code integer,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_notification_logs admin_notification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notification_logs
    ADD CONSTRAINT admin_notification_logs_pkey PRIMARY KEY (id);


--
-- Name: admin_profiles admin_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_profiles
    ADD CONSTRAINT admin_profiles_pkey PRIMARY KEY (id);


--
-- Name: admin_profiles admin_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_profiles
    ADD CONSTRAINT admin_profiles_user_id_key UNIQUE (user_id);


--
-- Name: admin_user_roles admin_user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_user_roles
    ADD CONSTRAINT admin_user_roles_pkey PRIMARY KEY (id);


--
-- Name: admin_user_roles admin_user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_user_roles
    ADD CONSTRAINT admin_user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: agent_folders agent_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_folders
    ADD CONSTRAINT agent_folders_pkey PRIMARY KEY (id);


--
-- Name: agent_knowledge agent_knowledge_automation_id_knowledge_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_knowledge
    ADD CONSTRAINT agent_knowledge_automation_id_knowledge_item_id_key UNIQUE (automation_id, knowledge_item_id);


--
-- Name: agent_knowledge agent_knowledge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_knowledge
    ADD CONSTRAINT agent_knowledge_pkey PRIMARY KEY (id);


--
-- Name: agent_templates agent_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_templates
    ADD CONSTRAINT agent_templates_pkey PRIMARY KEY (id);


--
-- Name: ai_template_base ai_template_base_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_template_base
    ADD CONSTRAINT ai_template_base_pkey PRIMARY KEY (id);


--
-- Name: ai_template_versions ai_template_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_template_versions
    ADD CONSTRAINT ai_template_versions_pkey PRIMARY KEY (id);


--
-- Name: ai_transfer_logs ai_transfer_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_transfer_logs
    ADD CONSTRAINT ai_transfer_logs_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: automations automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_pkey PRIMARY KEY (id);


--
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (id);


--
-- Name: client_actions client_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_actions
    ADD CONSTRAINT client_actions_pkey PRIMARY KEY (id);


--
-- Name: client_memories client_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_memories
    ADD CONSTRAINT client_memories_pkey PRIMARY KEY (id);


--
-- Name: client_tags client_tags_client_id_tag_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_tags
    ADD CONSTRAINT client_tags_client_id_tag_id_key UNIQUE (client_id, tag_id);


--
-- Name: client_tags client_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_tags
    ADD CONSTRAINT client_tags_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: consent_logs consent_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_logs
    ADD CONSTRAINT consent_logs_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: custom_statuses custom_statuses_law_firm_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_statuses
    ADD CONSTRAINT custom_statuses_law_firm_id_name_key UNIQUE (law_firm_id, name);


--
-- Name: custom_statuses custom_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_statuses
    ADD CONSTRAINT custom_statuses_pkey PRIMARY KEY (id);


--
-- Name: departments departments_law_firm_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_law_firm_id_name_key UNIQUE (law_firm_id, name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: evolution_api_connections evolution_api_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evolution_api_connections
    ADD CONSTRAINT evolution_api_connections_pkey PRIMARY KEY (id);


--
-- Name: google_calendar_ai_logs google_calendar_ai_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_ai_logs
    ADD CONSTRAINT google_calendar_ai_logs_pkey PRIMARY KEY (id);


--
-- Name: google_calendar_events google_calendar_events_law_firm_id_google_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_events
    ADD CONSTRAINT google_calendar_events_law_firm_id_google_event_id_key UNIQUE (law_firm_id, google_event_id);


--
-- Name: google_calendar_events google_calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_events
    ADD CONSTRAINT google_calendar_events_pkey PRIMARY KEY (id);


--
-- Name: google_calendar_integrations google_calendar_integrations_law_firm_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_integrations
    ADD CONSTRAINT google_calendar_integrations_law_firm_id_key UNIQUE (law_firm_id);


--
-- Name: google_calendar_integrations google_calendar_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_integrations
    ADD CONSTRAINT google_calendar_integrations_pkey PRIMARY KEY (id);


--
-- Name: instance_status_history instance_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_status_history
    ADD CONSTRAINT instance_status_history_pkey PRIMARY KEY (id);


--
-- Name: kanban_columns kanban_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_columns
    ADD CONSTRAINT kanban_columns_pkey PRIMARY KEY (id);


--
-- Name: knowledge_items knowledge_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_items
    ADD CONSTRAINT knowledge_items_pkey PRIMARY KEY (id);


--
-- Name: law_firm_settings law_firm_settings_law_firm_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.law_firm_settings
    ADD CONSTRAINT law_firm_settings_law_firm_id_key UNIQUE (law_firm_id);


--
-- Name: law_firm_settings law_firm_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.law_firm_settings
    ADD CONSTRAINT law_firm_settings_pkey PRIMARY KEY (id);


--
-- Name: law_firms law_firms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.law_firms
    ADD CONSTRAINT law_firms_pkey PRIMARY KEY (id);


--
-- Name: law_firms law_firms_subdomain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.law_firms
    ADD CONSTRAINT law_firms_subdomain_key UNIQUE (subdomain);


--
-- Name: member_departments member_departments_member_id_department_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_departments
    ADD CONSTRAINT member_departments_member_id_department_id_key UNIQUE (member_id, department_id);


--
-- Name: member_departments member_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_departments
    ADD CONSTRAINT member_departments_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: scheduled_follow_ups scheduled_follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_follow_ups
    ADD CONSTRAINT scheduled_follow_ups_pkey PRIMARY KEY (id);


--
-- Name: status_follow_ups status_follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_follow_ups
    ADD CONSTRAINT status_follow_ups_pkey PRIMARY KEY (id);


--
-- Name: system_metrics system_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_metrics
    ADD CONSTRAINT system_metrics_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_key_key UNIQUE (key);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: tags tags_law_firm_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_law_firm_id_name_key UNIQUE (law_firm_id, name);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: template_knowledge_items template_knowledge_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_knowledge_items
    ADD CONSTRAINT template_knowledge_items_pkey PRIMARY KEY (id);


--
-- Name: templates templates_law_firm_shortcut_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_law_firm_shortcut_unique UNIQUE (law_firm_id, shortcut);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: tray_chat_audit_logs tray_chat_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_chat_audit_logs
    ADD CONSTRAINT tray_chat_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: tray_chat_integrations tray_chat_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_chat_integrations
    ADD CONSTRAINT tray_chat_integrations_pkey PRIMARY KEY (id);


--
-- Name: tray_chat_integrations tray_chat_integrations_widget_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_chat_integrations
    ADD CONSTRAINT tray_chat_integrations_widget_key_key UNIQUE (widget_key);


--
-- Name: tray_commerce_audit_logs tray_commerce_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_commerce_audit_logs
    ADD CONSTRAINT tray_commerce_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: tray_commerce_connections tray_commerce_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_commerce_connections
    ADD CONSTRAINT tray_commerce_connections_pkey PRIMARY KEY (id);


--
-- Name: tray_commerce_sync_state tray_commerce_sync_state_connection_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_commerce_sync_state
    ADD CONSTRAINT tray_commerce_sync_state_connection_id_key UNIQUE (connection_id);


--
-- Name: tray_commerce_sync_state tray_commerce_sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_commerce_sync_state
    ADD CONSTRAINT tray_commerce_sync_state_pkey PRIMARY KEY (id);


--
-- Name: tray_commerce_webhook_logs tray_commerce_webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_commerce_webhook_logs
    ADD CONSTRAINT tray_commerce_webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: tray_coupon_map tray_coupon_map_connection_id_tray_coupon_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_coupon_map
    ADD CONSTRAINT tray_coupon_map_connection_id_tray_coupon_id_key UNIQUE (connection_id, tray_coupon_id);


--
-- Name: tray_coupon_map tray_coupon_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_coupon_map
    ADD CONSTRAINT tray_coupon_map_pkey PRIMARY KEY (id);


--
-- Name: tray_customer_map tray_customer_map_connection_id_tray_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_customer_map
    ADD CONSTRAINT tray_customer_map_connection_id_tray_customer_id_key UNIQUE (connection_id, tray_customer_id);


--
-- Name: tray_customer_map tray_customer_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_customer_map
    ADD CONSTRAINT tray_customer_map_pkey PRIMARY KEY (id);


--
-- Name: tray_order_map tray_order_map_connection_id_tray_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_order_map
    ADD CONSTRAINT tray_order_map_connection_id_tray_order_id_key UNIQUE (connection_id, tray_order_id);


--
-- Name: tray_order_map tray_order_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_order_map
    ADD CONSTRAINT tray_order_map_pkey PRIMARY KEY (id);


--
-- Name: tray_product_map tray_product_map_connection_id_tray_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_product_map
    ADD CONSTRAINT tray_product_map_connection_id_tray_product_id_key UNIQUE (connection_id, tray_product_id);


--
-- Name: tray_product_map tray_product_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_product_map
    ADD CONSTRAINT tray_product_map_pkey PRIMARY KEY (id);


--
-- Name: tray_chat_integrations unique_law_firm_tray_integration; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_chat_integrations
    ADD CONSTRAINT unique_law_firm_tray_integration UNIQUE (law_firm_id);


--
-- Name: usage_history_monthly usage_history_monthly_law_firm_id_billing_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_history_monthly
    ADD CONSTRAINT usage_history_monthly_law_firm_id_billing_period_key UNIQUE (law_firm_id, billing_period);


--
-- Name: usage_history_monthly usage_history_monthly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_history_monthly
    ADD CONSTRAINT usage_history_monthly_pkey PRIMARY KEY (id);


--
-- Name: usage_records usage_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_records
    ADD CONSTRAINT usage_records_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: webhook_logs webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_instances whatsapp_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_pkey PRIMARY KEY (id);


--
-- Name: idx_agent_knowledge_automation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_knowledge_automation ON public.agent_knowledge USING btree (automation_id);


--
-- Name: idx_agent_knowledge_knowledge_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_knowledge_knowledge_item ON public.agent_knowledge USING btree (knowledge_item_id);


--
-- Name: idx_agent_knowledge_law_firm_automation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_knowledge_law_firm_automation ON public.agent_knowledge USING btree (law_firm_id, automation_id);


--
-- Name: idx_agent_templates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_templates_active ON public.agent_templates USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_agent_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_templates_category ON public.agent_templates USING btree (category);


--
-- Name: idx_agent_templates_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_templates_order ON public.agent_templates USING btree (display_order);


--
-- Name: idx_ai_transfer_logs_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_transfer_logs_conversation_id ON public.ai_transfer_logs USING btree (conversation_id);


--
-- Name: idx_ai_transfer_logs_law_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_transfer_logs_law_firm_id ON public.ai_transfer_logs USING btree (law_firm_id);


--
-- Name: idx_ai_transfer_logs_to_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_transfer_logs_to_agent_id ON public.ai_transfer_logs USING btree (to_agent_id);


--
-- Name: idx_ai_transfer_logs_transferred_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_transfer_logs_transferred_at ON public.ai_transfer_logs USING btree (transferred_at DESC);


--
-- Name: idx_automations_folder_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automations_folder_position ON public.automations USING btree (folder_id, "position");


--
-- Name: idx_automations_law_firm_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automations_law_firm_active ON public.automations USING btree (law_firm_id, is_active) WHERE (is_active = true);


--
-- Name: idx_client_memories_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_memories_active ON public.client_memories USING btree (client_id, is_active) WHERE (is_active = true);


--
-- Name: idx_client_memories_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_memories_client_id ON public.client_memories USING btree (client_id);


--
-- Name: idx_client_memories_law_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_memories_law_firm_id ON public.client_memories USING btree (law_firm_id);


--
-- Name: idx_clients_phone_normalized_law_firm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_clients_phone_normalized_law_firm ON public.clients USING btree (public.normalize_phone(phone), law_firm_id);


--
-- Name: idx_clients_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_state ON public.clients USING btree (state);


--
-- Name: idx_companies_approval_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_approval_status ON public.companies USING btree (approval_status);


--
-- Name: idx_companies_n8n_next_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_n8n_next_retry ON public.companies USING btree (n8n_next_retry_at) WHERE ((n8n_workflow_status = ANY (ARRAY['error'::text, 'failed'::text])) AND (n8n_next_retry_at IS NOT NULL));


--
-- Name: idx_companies_n8n_workflow_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_n8n_workflow_status ON public.companies USING btree (n8n_workflow_status);


--
-- Name: idx_companies_template_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_template_version ON public.companies USING btree (template_version);


--
-- Name: idx_conversations_archived_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_archived_at ON public.conversations USING btree (archived_at) WHERE (archived_at IS NOT NULL);


--
-- Name: idx_conversations_audio_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_audio_enabled ON public.conversations USING btree (ai_audio_enabled) WHERE (ai_audio_enabled = true);


--
-- Name: idx_conversations_current_automation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_current_automation ON public.conversations USING btree (current_automation_id) WHERE (current_automation_id IS NOT NULL);


--
-- Name: idx_conversations_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_department_id ON public.conversations USING btree (department_id);


--
-- Name: idx_conversations_law_firm_automation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_law_firm_automation ON public.conversations USING btree (law_firm_id, current_automation_id);


--
-- Name: idx_conversations_needs_human; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_needs_human ON public.conversations USING btree (needs_human_handoff) WHERE (needs_human_handoff = true);


--
-- Name: idx_conversations_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_origin ON public.conversations USING btree (origin);


--
-- Name: idx_gcal_ai_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gcal_ai_logs_created ON public.google_calendar_ai_logs USING btree (created_at DESC);


--
-- Name: idx_gcal_ai_logs_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gcal_ai_logs_integration ON public.google_calendar_ai_logs USING btree (integration_id);


--
-- Name: idx_gcal_ai_logs_law_firm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gcal_ai_logs_law_firm ON public.google_calendar_ai_logs USING btree (law_firm_id);


--
-- Name: idx_gcal_events_google_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gcal_events_google_id ON public.google_calendar_events USING btree (google_event_id);


--
-- Name: idx_gcal_events_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gcal_events_integration ON public.google_calendar_events USING btree (integration_id);


--
-- Name: idx_gcal_events_law_firm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gcal_events_law_firm ON public.google_calendar_events USING btree (law_firm_id);


--
-- Name: idx_gcal_events_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gcal_events_start ON public.google_calendar_events USING btree (start_time);


--
-- Name: idx_gcal_integrations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gcal_integrations_active ON public.google_calendar_integrations USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_gcal_integrations_law_firm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gcal_integrations_law_firm ON public.google_calendar_integrations USING btree (law_firm_id);


--
-- Name: idx_instance_status_history_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instance_status_history_changed_at ON public.instance_status_history USING btree (changed_at DESC);


--
-- Name: idx_instance_status_history_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instance_status_history_instance ON public.instance_status_history USING btree (instance_id);


--
-- Name: idx_law_firms_subdomain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_law_firms_subdomain ON public.law_firms USING btree (subdomain);


--
-- Name: idx_member_departments_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_departments_department_id ON public.member_departments USING btree (department_id);


--
-- Name: idx_member_departments_member_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_departments_member_id ON public.member_departments USING btree (member_id);


--
-- Name: idx_messages_ai_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_ai_agent_id ON public.messages USING btree (ai_agent_id);


--
-- Name: idx_messages_is_internal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_is_internal ON public.messages USING btree (conversation_id, is_internal);


--
-- Name: idx_messages_read_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_read_at ON public.messages USING btree (conversation_id, read_at);


--
-- Name: idx_messages_reply_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_reply_to ON public.messages USING btree (reply_to_message_id);


--
-- Name: idx_messages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_status ON public.messages USING btree (status);


--
-- Name: idx_notification_logs_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_logs_dedup ON public.admin_notification_logs USING btree (event_type, tenant_id, event_key, sent_at DESC);


--
-- Name: idx_notification_logs_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_logs_recent ON public.admin_notification_logs USING btree (sent_at DESC);


--
-- Name: idx_profiles_law_firm_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_law_firm_active ON public.profiles USING btree (law_firm_id) WHERE (is_active = true);


--
-- Name: idx_scheduled_follow_ups_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_follow_ups_client ON public.scheduled_follow_ups USING btree (client_id);


--
-- Name: idx_scheduled_follow_ups_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_follow_ups_conversation ON public.scheduled_follow_ups USING btree (conversation_id);


--
-- Name: idx_scheduled_follow_ups_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_follow_ups_pending ON public.scheduled_follow_ups USING btree (scheduled_at) WHERE (status = 'pending'::text);


--
-- Name: idx_status_follow_ups_law_firm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_status_follow_ups_law_firm ON public.status_follow_ups USING btree (law_firm_id);


--
-- Name: idx_status_follow_ups_status_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_status_follow_ups_status_id ON public.status_follow_ups USING btree (status_id);


--
-- Name: idx_template_knowledge_items_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_knowledge_items_template ON public.template_knowledge_items USING btree (template_id);


--
-- Name: idx_template_versions_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_versions_template ON public.ai_template_versions USING btree (template_id);


--
-- Name: idx_tray_commerce_audit_logs_connection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_commerce_audit_logs_connection ON public.tray_commerce_audit_logs USING btree (connection_id);


--
-- Name: idx_tray_commerce_audit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_commerce_audit_logs_created ON public.tray_commerce_audit_logs USING btree (created_at DESC);


--
-- Name: idx_tray_commerce_audit_logs_law_firm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_commerce_audit_logs_law_firm ON public.tray_commerce_audit_logs USING btree (law_firm_id);


--
-- Name: idx_tray_commerce_connections_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_commerce_connections_active ON public.tray_commerce_connections USING btree (is_active);


--
-- Name: idx_tray_commerce_connections_law_firm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_commerce_connections_law_firm ON public.tray_commerce_connections USING btree (law_firm_id);


--
-- Name: idx_tray_commerce_connections_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_commerce_connections_status ON public.tray_commerce_connections USING btree (connection_status);


--
-- Name: idx_tray_commerce_webhook_logs_connection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_commerce_webhook_logs_connection ON public.tray_commerce_webhook_logs USING btree (connection_id);


--
-- Name: idx_tray_commerce_webhook_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_commerce_webhook_logs_created ON public.tray_commerce_webhook_logs USING btree (created_at DESC);


--
-- Name: idx_tray_coupon_map_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_coupon_map_code ON public.tray_coupon_map USING btree (code);


--
-- Name: idx_tray_coupon_map_connection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_coupon_map_connection ON public.tray_coupon_map USING btree (connection_id);


--
-- Name: idx_tray_customer_map_connection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_customer_map_connection ON public.tray_customer_map USING btree (connection_id);


--
-- Name: idx_tray_customer_map_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_customer_map_email ON public.tray_customer_map USING btree (email);


--
-- Name: idx_tray_order_map_connection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_order_map_connection ON public.tray_order_map USING btree (connection_id);


--
-- Name: idx_tray_order_map_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_order_map_date ON public.tray_order_map USING btree (order_date DESC);


--
-- Name: idx_tray_order_map_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_order_map_status ON public.tray_order_map USING btree (tray_status);


--
-- Name: idx_tray_order_map_tray_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_order_map_tray_id ON public.tray_order_map USING btree (tray_order_id);


--
-- Name: idx_tray_product_map_connection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_product_map_connection ON public.tray_product_map USING btree (connection_id);


--
-- Name: idx_tray_product_map_tray_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tray_product_map_tray_id ON public.tray_product_map USING btree (tray_product_id);


--
-- Name: idx_usage_history_law_firm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_history_law_firm ON public.usage_history_monthly USING btree (law_firm_id);


--
-- Name: idx_usage_history_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_history_period ON public.usage_history_monthly USING btree (billing_period);


--
-- Name: idx_usage_records_law_firm_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_records_law_firm_period ON public.usage_records USING btree (law_firm_id, billing_period);


--
-- Name: idx_usage_records_type_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_records_type_period ON public.usage_records USING btree (usage_type, billing_period);


--
-- Name: idx_whatsapp_instances_law_firm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_instances_law_firm ON public.whatsapp_instances USING btree (law_firm_id);


--
-- Name: messages_whatsapp_message_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX messages_whatsapp_message_id_unique ON public.messages USING btree (whatsapp_message_id) WHERE (whatsapp_message_id IS NOT NULL);


--
-- Name: automations backup_prompt_before_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER backup_prompt_before_update BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION public.backup_automation_prompt();


--
-- Name: tray_commerce_connections create_tray_sync_state_on_connection; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER create_tray_sync_state_on_connection AFTER INSERT ON public.tray_commerce_connections FOR EACH ROW EXECUTE FUNCTION public.create_tray_sync_state();


--
-- Name: evolution_api_connections ensure_single_default_evolution; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ensure_single_default_evolution BEFORE INSERT OR UPDATE ON public.evolution_api_connections FOR EACH ROW WHEN ((new.is_default = true)) EXECUTE FUNCTION public.ensure_single_default_evolution_connection();


--
-- Name: tray_commerce_connections ensure_single_default_tray_connection; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ensure_single_default_tray_connection BEFORE INSERT OR UPDATE ON public.tray_commerce_connections FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_tray_connection();


--
-- Name: profiles on_profile_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_profile_created AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();


--
-- Name: whatsapp_instances track_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER track_status_change BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.track_instance_status_change();


--
-- Name: messages trigger_cancel_follow_ups_on_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_cancel_follow_ups_on_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.cancel_follow_ups_on_client_message();


--
-- Name: clients trigger_schedule_follow_ups; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_schedule_follow_ups AFTER UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.schedule_follow_ups_on_status_change();


--
-- Name: admin_profiles update_admin_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_admin_profiles_updated_at BEFORE UPDATE ON public.admin_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_folders update_agent_folders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agent_folders_updated_at BEFORE UPDATE ON public.agent_folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_templates update_agent_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agent_templates_updated_at BEFORE UPDATE ON public.agent_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_template_base update_ai_template_base_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_template_base_updated_at BEFORE UPDATE ON public.ai_template_base FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: automations update_automations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_automations_updated_at BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cases update_cases_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: client_memories update_client_memories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_client_memories_updated_at BEFORE UPDATE ON public.client_memories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: clients update_clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: companies update_companies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conversations update_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: custom_statuses update_custom_statuses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_custom_statuses_updated_at BEFORE UPDATE ON public.custom_statuses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: departments update_departments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: evolution_api_connections update_evolution_api_connections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_evolution_api_connections_updated_at BEFORE UPDATE ON public.evolution_api_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: google_calendar_events update_google_calendar_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_google_calendar_events_updated_at BEFORE UPDATE ON public.google_calendar_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: google_calendar_integrations update_google_calendar_integrations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_google_calendar_integrations_updated_at BEFORE UPDATE ON public.google_calendar_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: knowledge_items update_knowledge_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_knowledge_items_updated_at BEFORE UPDATE ON public.knowledge_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: law_firm_settings update_law_firm_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_law_firm_settings_updated_at BEFORE UPDATE ON public.law_firm_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: law_firms update_law_firms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_law_firms_updated_at BEFORE UPDATE ON public.law_firms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: plans update_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: status_follow_ups update_status_follow_ups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_status_follow_ups_updated_at BEFORE UPDATE ON public.status_follow_ups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: system_settings update_system_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: template_knowledge_items update_template_knowledge_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_template_knowledge_items_updated_at BEFORE UPDATE ON public.template_knowledge_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: templates update_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tray_chat_integrations update_tray_chat_integrations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tray_chat_integrations_updated_at BEFORE UPDATE ON public.tray_chat_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tray_commerce_connections update_tray_commerce_connections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tray_commerce_connections_updated_at BEFORE UPDATE ON public.tray_commerce_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tray_commerce_sync_state update_tray_commerce_sync_state_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tray_commerce_sync_state_updated_at BEFORE UPDATE ON public.tray_commerce_sync_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tray_coupon_map update_tray_coupon_map_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tray_coupon_map_updated_at BEFORE UPDATE ON public.tray_coupon_map FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tray_customer_map update_tray_customer_map_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tray_customer_map_updated_at BEFORE UPDATE ON public.tray_customer_map FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tray_order_map update_tray_order_map_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tray_order_map_updated_at BEFORE UPDATE ON public.tray_order_map FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tray_product_map update_tray_product_map_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tray_product_map_updated_at BEFORE UPDATE ON public.tray_product_map FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_instances update_whatsapp_instances_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_knowledge validate_agent_knowledge_tenant_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_agent_knowledge_tenant_trigger BEFORE INSERT OR UPDATE ON public.agent_knowledge FOR EACH ROW EXECUTE FUNCTION public.validate_agent_knowledge_tenant();


--
-- Name: admin_notification_logs admin_notification_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notification_logs
    ADD CONSTRAINT admin_notification_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: admin_profiles admin_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_profiles
    ADD CONSTRAINT admin_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: admin_user_roles admin_user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_user_roles
    ADD CONSTRAINT admin_user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agent_folders agent_folders_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_folders
    ADD CONSTRAINT agent_folders_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: agent_knowledge agent_knowledge_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_knowledge
    ADD CONSTRAINT agent_knowledge_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE CASCADE;


--
-- Name: agent_knowledge agent_knowledge_knowledge_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_knowledge
    ADD CONSTRAINT agent_knowledge_knowledge_item_id_fkey FOREIGN KEY (knowledge_item_id) REFERENCES public.knowledge_items(id) ON DELETE CASCADE;


--
-- Name: ai_template_versions ai_template_versions_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_template_versions
    ADD CONSTRAINT ai_template_versions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.ai_template_base(id) ON DELETE CASCADE;


--
-- Name: ai_transfer_logs ai_transfer_logs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_transfer_logs
    ADD CONSTRAINT ai_transfer_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: ai_transfer_logs ai_transfer_logs_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_transfer_logs
    ADD CONSTRAINT ai_transfer_logs_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: automations automations_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.agent_folders(id) ON DELETE SET NULL;


--
-- Name: automations automations_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: cases cases_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: cases cases_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: cases cases_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: cases cases_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: client_actions client_actions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_actions
    ADD CONSTRAINT client_actions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_actions client_actions_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_actions
    ADD CONSTRAINT client_actions_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: client_actions client_actions_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_actions
    ADD CONSTRAINT client_actions_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.profiles(id);


--
-- Name: client_memories client_memories_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_memories
    ADD CONSTRAINT client_memories_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_memories client_memories_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_memories
    ADD CONSTRAINT client_memories_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: client_memories client_memories_source_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_memories
    ADD CONSTRAINT client_memories_source_conversation_id_fkey FOREIGN KEY (source_conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: client_tags client_tags_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_tags
    ADD CONSTRAINT client_tags_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_tags client_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_tags
    ADD CONSTRAINT client_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: clients clients_custom_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_custom_status_id_fkey FOREIGN KEY (custom_status_id) REFERENCES public.custom_statuses(id) ON DELETE SET NULL;


--
-- Name: clients clients_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: clients clients_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: companies companies_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id);


--
-- Name: companies companies_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: companies companies_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: consent_logs consent_logs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_logs
    ADD CONSTRAINT consent_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_current_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_current_automation_id_fkey FOREIGN KEY (current_automation_id) REFERENCES public.automations(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_whatsapp_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_whatsapp_instance_id_fkey FOREIGN KEY (whatsapp_instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;


--
-- Name: custom_statuses custom_statuses_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_statuses
    ADD CONSTRAINT custom_statuses_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: departments departments_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: documents documents_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- Name: documents documents_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: documents documents_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_knowledge fk_agent_knowledge_law_firm; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_knowledge
    ADD CONSTRAINT fk_agent_knowledge_law_firm FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: conversations fk_conversations_current_automation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT fk_conversations_current_automation FOREIGN KEY (current_automation_id) REFERENCES public.automations(id) ON DELETE SET NULL;


--
-- Name: google_calendar_ai_logs google_calendar_ai_logs_ai_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_ai_logs
    ADD CONSTRAINT google_calendar_ai_logs_ai_agent_id_fkey FOREIGN KEY (ai_agent_id) REFERENCES public.automations(id);


--
-- Name: google_calendar_ai_logs google_calendar_ai_logs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_ai_logs
    ADD CONSTRAINT google_calendar_ai_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: google_calendar_ai_logs google_calendar_ai_logs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_ai_logs
    ADD CONSTRAINT google_calendar_ai_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: google_calendar_ai_logs google_calendar_ai_logs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_ai_logs
    ADD CONSTRAINT google_calendar_ai_logs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.google_calendar_integrations(id) ON DELETE CASCADE;


--
-- Name: google_calendar_ai_logs google_calendar_ai_logs_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_ai_logs
    ADD CONSTRAINT google_calendar_ai_logs_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: google_calendar_events google_calendar_events_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_events
    ADD CONSTRAINT google_calendar_events_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: google_calendar_events google_calendar_events_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_events
    ADD CONSTRAINT google_calendar_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: google_calendar_events google_calendar_events_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_events
    ADD CONSTRAINT google_calendar_events_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.google_calendar_integrations(id) ON DELETE CASCADE;


--
-- Name: google_calendar_events google_calendar_events_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_events
    ADD CONSTRAINT google_calendar_events_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: google_calendar_integrations google_calendar_integrations_connected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_integrations
    ADD CONSTRAINT google_calendar_integrations_connected_by_fkey FOREIGN KEY (connected_by) REFERENCES auth.users(id);


--
-- Name: google_calendar_integrations google_calendar_integrations_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_integrations
    ADD CONSTRAINT google_calendar_integrations_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: instance_status_history instance_status_history_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_status_history
    ADD CONSTRAINT instance_status_history_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE;


--
-- Name: kanban_columns kanban_columns_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_columns
    ADD CONSTRAINT kanban_columns_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: knowledge_items knowledge_items_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_items
    ADD CONSTRAINT knowledge_items_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: law_firm_settings law_firm_settings_default_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.law_firm_settings
    ADD CONSTRAINT law_firm_settings_default_automation_id_fkey FOREIGN KEY (default_automation_id) REFERENCES public.automations(id) ON DELETE SET NULL;


--
-- Name: law_firm_settings law_firm_settings_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.law_firm_settings
    ADD CONSTRAINT law_firm_settings_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: member_departments member_departments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_departments
    ADD CONSTRAINT member_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: member_departments member_departments_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_departments
    ADD CONSTRAINT member_departments_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: messages messages_ai_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_ai_agent_id_fkey FOREIGN KEY (ai_agent_id) REFERENCES public.automations(id) ON DELETE SET NULL;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE SET NULL;


--
-- Name: scheduled_follow_ups scheduled_follow_ups_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_follow_ups
    ADD CONSTRAINT scheduled_follow_ups_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: scheduled_follow_ups scheduled_follow_ups_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_follow_ups
    ADD CONSTRAINT scheduled_follow_ups_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: scheduled_follow_ups scheduled_follow_ups_follow_up_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_follow_ups
    ADD CONSTRAINT scheduled_follow_ups_follow_up_rule_id_fkey FOREIGN KEY (follow_up_rule_id) REFERENCES public.status_follow_ups(id) ON DELETE CASCADE;


--
-- Name: scheduled_follow_ups scheduled_follow_ups_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_follow_ups
    ADD CONSTRAINT scheduled_follow_ups_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: scheduled_follow_ups scheduled_follow_ups_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_follow_ups
    ADD CONSTRAINT scheduled_follow_ups_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE SET NULL;


--
-- Name: status_follow_ups status_follow_ups_give_up_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_follow_ups
    ADD CONSTRAINT status_follow_ups_give_up_status_id_fkey FOREIGN KEY (give_up_status_id) REFERENCES public.custom_statuses(id) ON DELETE SET NULL;


--
-- Name: status_follow_ups status_follow_ups_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_follow_ups
    ADD CONSTRAINT status_follow_ups_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: status_follow_ups status_follow_ups_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_follow_ups
    ADD CONSTRAINT status_follow_ups_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.custom_statuses(id) ON DELETE CASCADE;


--
-- Name: status_follow_ups status_follow_ups_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_follow_ups
    ADD CONSTRAINT status_follow_ups_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE SET NULL;


--
-- Name: tags tags_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: template_knowledge_items template_knowledge_items_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_knowledge_items
    ADD CONSTRAINT template_knowledge_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.ai_template_base(id) ON DELETE CASCADE;


--
-- Name: templates templates_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: tray_chat_audit_logs tray_chat_audit_logs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_chat_audit_logs
    ADD CONSTRAINT tray_chat_audit_logs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.tray_chat_integrations(id) ON DELETE CASCADE;


--
-- Name: tray_chat_audit_logs tray_chat_audit_logs_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_chat_audit_logs
    ADD CONSTRAINT tray_chat_audit_logs_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: tray_chat_audit_logs tray_chat_audit_logs_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_chat_audit_logs
    ADD CONSTRAINT tray_chat_audit_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id);


--
-- Name: tray_chat_integrations tray_chat_integrations_activated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_chat_integrations
    ADD CONSTRAINT tray_chat_integrations_activated_by_fkey FOREIGN KEY (activated_by) REFERENCES auth.users(id);


--
-- Name: tray_chat_integrations tray_chat_integrations_deactivated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_chat_integrations
    ADD CONSTRAINT tray_chat_integrations_deactivated_by_fkey FOREIGN KEY (deactivated_by) REFERENCES auth.users(id);


--
-- Name: tray_chat_integrations tray_chat_integrations_default_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_chat_integrations
    ADD CONSTRAINT tray_chat_integrations_default_automation_id_fkey FOREIGN KEY (default_automation_id) REFERENCES public.automations(id) ON DELETE SET NULL;


--
-- Name: tray_chat_integrations tray_chat_integrations_default_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_chat_integrations
    ADD CONSTRAINT tray_chat_integrations_default_department_id_fkey FOREIGN KEY (default_department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: tray_chat_integrations tray_chat_integrations_default_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_chat_integrations
    ADD CONSTRAINT tray_chat_integrations_default_status_id_fkey FOREIGN KEY (default_status_id) REFERENCES public.custom_statuses(id) ON DELETE SET NULL;


--
-- Name: tray_chat_integrations tray_chat_integrations_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_chat_integrations
    ADD CONSTRAINT tray_chat_integrations_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: tray_commerce_audit_logs tray_commerce_audit_logs_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_commerce_audit_logs
    ADD CONSTRAINT tray_commerce_audit_logs_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.tray_commerce_connections(id) ON DELETE SET NULL;


--
-- Name: tray_commerce_audit_logs tray_commerce_audit_logs_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_commerce_audit_logs
    ADD CONSTRAINT tray_commerce_audit_logs_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: tray_commerce_audit_logs tray_commerce_audit_logs_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_commerce_audit_logs
    ADD CONSTRAINT tray_commerce_audit_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id);


--
-- Name: tray_commerce_connections tray_commerce_connections_connected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_commerce_connections
    ADD CONSTRAINT tray_commerce_connections_connected_by_fkey FOREIGN KEY (connected_by) REFERENCES auth.users(id);


--
-- Name: tray_commerce_connections tray_commerce_connections_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_commerce_connections
    ADD CONSTRAINT tray_commerce_connections_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: tray_commerce_sync_state tray_commerce_sync_state_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_commerce_sync_state
    ADD CONSTRAINT tray_commerce_sync_state_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.tray_commerce_connections(id) ON DELETE CASCADE;


--
-- Name: tray_commerce_webhook_logs tray_commerce_webhook_logs_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_commerce_webhook_logs
    ADD CONSTRAINT tray_commerce_webhook_logs_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.tray_commerce_connections(id) ON DELETE SET NULL;


--
-- Name: tray_commerce_webhook_logs tray_commerce_webhook_logs_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_commerce_webhook_logs
    ADD CONSTRAINT tray_commerce_webhook_logs_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE SET NULL;


--
-- Name: tray_coupon_map tray_coupon_map_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_coupon_map
    ADD CONSTRAINT tray_coupon_map_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.tray_commerce_connections(id) ON DELETE CASCADE;


--
-- Name: tray_customer_map tray_customer_map_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_customer_map
    ADD CONSTRAINT tray_customer_map_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.tray_commerce_connections(id) ON DELETE CASCADE;


--
-- Name: tray_customer_map tray_customer_map_local_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_customer_map
    ADD CONSTRAINT tray_customer_map_local_client_id_fkey FOREIGN KEY (local_client_id) REFERENCES public.clients(id);


--
-- Name: tray_order_map tray_order_map_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_order_map
    ADD CONSTRAINT tray_order_map_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.tray_commerce_connections(id) ON DELETE CASCADE;


--
-- Name: tray_order_map tray_order_map_local_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_order_map
    ADD CONSTRAINT tray_order_map_local_conversation_id_fkey FOREIGN KEY (local_conversation_id) REFERENCES public.conversations(id);


--
-- Name: tray_product_map tray_product_map_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tray_product_map
    ADD CONSTRAINT tray_product_map_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.tray_commerce_connections(id) ON DELETE CASCADE;


--
-- Name: usage_history_monthly usage_history_monthly_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_history_monthly
    ADD CONSTRAINT usage_history_monthly_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: usage_records usage_records_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_records
    ADD CONSTRAINT usage_records_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webhook_logs webhook_logs_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE SET NULL;


--
-- Name: whatsapp_instances whatsapp_instances_default_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_default_assigned_to_fkey FOREIGN KEY (default_assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: whatsapp_instances whatsapp_instances_default_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_default_automation_id_fkey FOREIGN KEY (default_automation_id) REFERENCES public.automations(id) ON DELETE SET NULL;


--
-- Name: whatsapp_instances whatsapp_instances_default_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_default_department_id_fkey FOREIGN KEY (default_department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: whatsapp_instances whatsapp_instances_default_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_default_status_id_fkey FOREIGN KEY (default_status_id) REFERENCES public.custom_statuses(id) ON DELETE SET NULL;


--
-- Name: whatsapp_instances whatsapp_instances_law_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;


--
-- Name: agent_knowledge Admins can manage agent knowledge; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage agent knowledge" ON public.agent_knowledge USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: automations Admins can manage automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage automations" ON public.automations TO authenticated USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: companies Admins can manage companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage companies" ON public.companies USING (public.is_admin(auth.uid()));


--
-- Name: departments Admins can manage departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage departments" ON public.departments USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: whatsapp_instances Admins can manage instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage instances" ON public.whatsapp_instances TO authenticated USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: kanban_columns Admins can manage kanban columns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage kanban columns" ON public.kanban_columns TO authenticated USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: knowledge_items Admins can manage knowledge items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage knowledge items" ON public.knowledge_items USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: law_firm_settings Admins can manage law firm settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage law firm settings" ON public.law_firm_settings USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: member_departments Admins can manage member departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage member departments" ON public.member_departments USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = member_departments.member_id) AND (p.law_firm_id = public.get_user_law_firm_id(auth.uid())))))));


--
-- Name: notifications Admins can manage notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage notifications" ON public.notifications USING (public.is_admin(auth.uid()));


--
-- Name: user_roles Admins can manage roles in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage roles in their law firm" ON public.user_roles TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_roles.user_id) AND (p.law_firm_id = public.get_user_law_firm_id(auth.uid())))))));


--
-- Name: custom_statuses Admins can manage statuses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage statuses" ON public.custom_statuses USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tags Admins can manage tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage tags" ON public.tags USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: ai_template_base Admins can manage template base; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage template base" ON public.ai_template_base USING (public.is_admin(auth.uid()));


--
-- Name: template_knowledge_items Admins can manage template knowledge; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage template knowledge" ON public.template_knowledge_items USING (public.is_admin(auth.uid()));


--
-- Name: ai_template_versions Admins can manage template versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage template versions" ON public.ai_template_versions USING (public.is_admin(auth.uid()));


--
-- Name: templates Admins can manage templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage templates" ON public.templates USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tray_coupon_map Admins can manage their connection coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage their connection coupons" ON public.tray_coupon_map USING (((EXISTS ( SELECT 1
   FROM public.tray_commerce_connections c
  WHERE ((c.id = tray_coupon_map.connection_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tray_customer_map Admins can manage their connection customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage their connection customers" ON public.tray_customer_map USING (((EXISTS ( SELECT 1
   FROM public.tray_commerce_connections c
  WHERE ((c.id = tray_customer_map.connection_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tray_order_map Admins can manage their connection orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage their connection orders" ON public.tray_order_map USING (((EXISTS ( SELECT 1
   FROM public.tray_commerce_connections c
  WHERE ((c.id = tray_order_map.connection_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tray_product_map Admins can manage their connection products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage their connection products" ON public.tray_product_map USING (((EXISTS ( SELECT 1
   FROM public.tray_commerce_connections c
  WHERE ((c.id = tray_product_map.connection_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tray_commerce_sync_state Admins can manage their connection sync state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage their connection sync state" ON public.tray_commerce_sync_state USING (((EXISTS ( SELECT 1
   FROM public.tray_commerce_connections c
  WHERE ((c.id = tray_commerce_sync_state.connection_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tray_commerce_connections Admins can manage their law firm connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage their law firm connections" ON public.tray_commerce_connections USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: google_calendar_integrations Admins can manage their law firm integration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage their law firm integration" ON public.google_calendar_integrations USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tray_chat_integrations Admins can manage their law firm tray integration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage their law firm tray integration" ON public.tray_chat_integrations USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: law_firms Admins can update their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update their law firm" ON public.law_firms FOR UPDATE TO authenticated USING (((id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: admin_user_roles Admins can view admin roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view admin roles" ON public.admin_user_roles FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: admin_profiles Admins can view all admin profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all admin profiles" ON public.admin_profiles FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: usage_records Admins can view all usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all usage" ON public.usage_records FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: audit_logs Admins can view audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: companies Admins can view companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view companies" ON public.companies FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: evolution_api_connections Admins can view evolution connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view evolution connections" ON public.evolution_api_connections FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: instance_status_history Admins can view instance status history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view instance status history" ON public.instance_status_history FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: admin_notification_logs Admins can view notification logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view notification logs" ON public.admin_notification_logs FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: system_metrics Admins can view system metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view system metrics" ON public.system_metrics FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: system_settings Admins can view system settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view system settings" ON public.system_settings FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: ai_template_base Admins can view template base; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view template base" ON public.ai_template_base FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: template_knowledge_items Admins can view template knowledge; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view template knowledge" ON public.template_knowledge_items FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: ai_template_versions Admins can view template versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view template versions" ON public.ai_template_versions FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: tray_chat_audit_logs Admins can view their law firm audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view their law firm audit logs" ON public.tray_chat_audit_logs FOR SELECT USING (((law_firm_id = public.get_user_law_firm_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: usage_history_monthly Admins can view usage history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view usage history" ON public.usage_history_monthly FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: webhook_logs Admins can view webhook logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view webhook logs" ON public.webhook_logs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND ((automation_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.automations a
  WHERE ((a.id = webhook_logs.automation_id) AND (a.law_firm_id = public.get_user_law_firm_id(auth.uid()))))))));


--
-- Name: agent_templates Authenticated users can read active agent templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read active agent templates" ON public.agent_templates FOR SELECT TO authenticated USING ((is_active = true));


--
-- Name: plans Authenticated users can view active plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view active plans" ON public.plans FOR SELECT USING ((((auth.uid() IS NOT NULL) AND (is_active = true)) OR public.is_admin(auth.uid())));


--
-- Name: agent_templates Global admins can manage agent templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Global admins can manage agent templates" ON public.agent_templates TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: whatsapp_instances Global admins can manage all instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Global admins can manage all instances" ON public.whatsapp_instances TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: law_firm_settings Global admins can manage all law firm settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Global admins can manage all law firm settings" ON public.law_firm_settings USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: automations Global admins can view all automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Global admins can view all automations" ON public.automations FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: clients Global admins can view all clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Global admins can view all clients" ON public.clients FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: conversations Global admins can view all conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Global admins can view all conversations" ON public.conversations FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: whatsapp_instances Global admins can view all instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Global admins can view all instances" ON public.whatsapp_instances FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: messages Global admins can view all messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Global admins can view all messages" ON public.messages FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: profiles Global admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Global admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: ai_transfer_logs Global admins can view all transfer logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Global admins can view all transfer logs" ON public.ai_transfer_logs FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: usage_records Global admins can view all usage records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Global admins can view all usage records" ON public.usage_records FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: admin_notification_logs Service role can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert notifications" ON public.admin_notification_logs FOR INSERT WITH CHECK (true);


--
-- Name: client_memories Service role has full access to client_memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role has full access to client_memories" ON public.client_memories USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: usage_records Service role has full access to usage_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role has full access to usage_records" ON public.usage_records USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: admin_profiles Super admins can manage admin profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage admin profiles" ON public.admin_profiles USING (public.has_admin_role(auth.uid(), 'super_admin'::public.admin_role));


--
-- Name: admin_user_roles Super admins can manage admin roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage admin roles" ON public.admin_user_roles USING (public.has_admin_role(auth.uid(), 'super_admin'::public.admin_role));


--
-- Name: evolution_api_connections Super admins can manage evolution connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage evolution connections" ON public.evolution_api_connections USING (public.has_admin_role(auth.uid(), 'super_admin'::public.admin_role));


--
-- Name: plans Super admins can manage plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage plans" ON public.plans USING (public.has_admin_role(auth.uid(), 'super_admin'::public.admin_role));


--
-- Name: system_settings Super admins can manage system settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can manage system settings" ON public.system_settings USING (public.has_admin_role(auth.uid(), 'super_admin'::public.admin_role));


--
-- Name: audit_logs System can insert audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);


--
-- Name: tray_chat_audit_logs System can insert audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert audit logs" ON public.tray_chat_audit_logs FOR INSERT WITH CHECK (true);


--
-- Name: tray_commerce_audit_logs System can insert audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert audit logs" ON public.tray_commerce_audit_logs FOR INSERT WITH CHECK (true);


--
-- Name: google_calendar_ai_logs System can insert logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert logs" ON public.google_calendar_ai_logs FOR INSERT WITH CHECK (true);


--
-- Name: system_metrics System can insert metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert metrics" ON public.system_metrics FOR INSERT WITH CHECK (true);


--
-- Name: instance_status_history System can insert status history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert status history" ON public.instance_status_history FOR INSERT WITH CHECK (true);


--
-- Name: ai_transfer_logs System can insert transfer logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert transfer logs" ON public.ai_transfer_logs FOR INSERT WITH CHECK (true);


--
-- Name: tray_commerce_webhook_logs System can insert webhook logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert webhook logs" ON public.tray_commerce_webhook_logs FOR INSERT WITH CHECK (true);


--
-- Name: usage_history_monthly System can manage usage history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can manage usage history" ON public.usage_history_monthly USING (true);


--
-- Name: agent_folders Users can create folders for their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create folders for their law firm" ON public.agent_folders FOR INSERT WITH CHECK ((law_firm_id IN ( SELECT profiles.law_firm_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: client_memories Users can create memories for their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create memories for their law firm" ON public.client_memories FOR INSERT WITH CHECK ((law_firm_id IN ( SELECT profiles.law_firm_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: clients Users can delete clients in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete clients in their law firm" ON public.clients FOR DELETE USING (((auth.uid() IS NOT NULL) AND (public.get_user_law_firm_id(auth.uid()) IS NOT NULL) AND (law_firm_id = public.get_user_law_firm_id(auth.uid()))));


--
-- Name: agent_folders Users can delete folders from their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete folders from their law firm" ON public.agent_folders FOR DELETE USING ((law_firm_id IN ( SELECT profiles.law_firm_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: status_follow_ups Users can delete follow-ups of their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete follow-ups of their law firm" ON public.status_follow_ups FOR DELETE USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: client_memories Users can delete memories from their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete memories from their law firm" ON public.client_memories FOR DELETE USING ((law_firm_id IN ( SELECT profiles.law_firm_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: client_actions Users can insert actions in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert actions in their law firm" ON public.client_actions FOR INSERT WITH CHECK ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: clients Users can insert clients in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert clients in their law firm" ON public.clients FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (public.get_user_law_firm_id(auth.uid()) IS NOT NULL) AND (law_firm_id = public.get_user_law_firm_id(auth.uid()))));


--
-- Name: status_follow_ups Users can insert follow-ups for their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert follow-ups for their law firm" ON public.status_follow_ups FOR INSERT WITH CHECK ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));


--
-- Name: cases Users can manage cases in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage cases in their law firm" ON public.cases TO authenticated USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: client_tags Users can manage client tags in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage client tags in their law firm" ON public.client_tags USING ((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = client_tags.client_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))));


--
-- Name: consent_logs Users can manage consent logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage consent logs" ON public.consent_logs TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = consent_logs.client_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))));


--
-- Name: conversations Users can manage conversations in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage conversations in their law firm" ON public.conversations TO authenticated USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: documents Users can manage documents in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage documents in their law firm" ON public.documents TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = documents.client_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM public.cases cs
  WHERE ((cs.id = documents.case_id) AND (cs.law_firm_id = public.get_user_law_firm_id(auth.uid())))))));


--
-- Name: messages Users can manage messages in their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage messages in their conversations" ON public.messages TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))));


--
-- Name: google_calendar_events Users can manage their law firm events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their law firm events" ON public.google_calendar_events USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: clients Users can update clients in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update clients in their law firm" ON public.clients FOR UPDATE USING (((auth.uid() IS NOT NULL) AND (public.get_user_law_firm_id(auth.uid()) IS NOT NULL) AND (law_firm_id = public.get_user_law_firm_id(auth.uid()))));


--
-- Name: agent_folders Users can update folders from their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update folders from their law firm" ON public.agent_folders FOR UPDATE USING ((law_firm_id IN ( SELECT profiles.law_firm_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: status_follow_ups Users can update follow-ups of their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update follow-ups of their law firm" ON public.status_follow_ups FOR UPDATE USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: client_memories Users can update memories from their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update memories from their law firm" ON public.client_memories FOR UPDATE USING ((law_firm_id IN ( SELECT profiles.law_firm_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid()));


--
-- Name: client_actions Users can view actions in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view actions in their law firm" ON public.client_actions FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: agent_knowledge Users can view agent knowledge in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view agent knowledge in their law firm" ON public.agent_knowledge FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: automations Users can view automations in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view automations in their law firm" ON public.automations FOR SELECT TO authenticated USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: cases Users can view cases in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view cases in their law firm" ON public.cases FOR SELECT TO authenticated USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: client_tags Users can view client tags in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view client tags in their law firm" ON public.client_tags FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = client_tags.client_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))));


--
-- Name: clients Users can view clients in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view clients in their law firm" ON public.clients FOR SELECT USING (((auth.uid() IS NOT NULL) AND (public.get_user_law_firm_id(auth.uid()) IS NOT NULL) AND (law_firm_id = public.get_user_law_firm_id(auth.uid()))));


--
-- Name: consent_logs Users can view consent logs for their clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view consent logs for their clients" ON public.consent_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = consent_logs.client_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))));


--
-- Name: conversations Users can view conversations in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view conversations in their law firm" ON public.conversations FOR SELECT USING ((((auth.uid() IS NOT NULL) AND (law_firm_id = public.get_user_law_firm_id(auth.uid()))) OR public.is_admin(auth.uid())));


--
-- Name: departments Users can view departments in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view departments in their law firm" ON public.departments FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: documents Users can view documents in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view documents in their law firm" ON public.documents FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = documents.client_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM public.cases cs
  WHERE ((cs.id = documents.case_id) AND (cs.law_firm_id = public.get_user_law_firm_id(auth.uid())))))));


--
-- Name: agent_folders Users can view folders from their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view folders from their law firm" ON public.agent_folders FOR SELECT USING ((law_firm_id IN ( SELECT profiles.law_firm_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: whatsapp_instances Users can view instances in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view instances in their law firm" ON public.whatsapp_instances FOR SELECT TO authenticated USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: kanban_columns Users can view kanban columns in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view kanban columns in their law firm" ON public.kanban_columns FOR SELECT TO authenticated USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: knowledge_items Users can view knowledge items in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view knowledge items in their law firm" ON public.knowledge_items FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: law_firm_settings Users can view law firm settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view law firm settings" ON public.law_firm_settings FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: member_departments Users can view member departments in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view member departments in their law firm" ON public.member_departments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = member_departments.member_id) AND (p.law_firm_id = public.get_user_law_firm_id(auth.uid()))))));


--
-- Name: client_memories Users can view memories from their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view memories from their law firm" ON public.client_memories FOR SELECT USING ((law_firm_id IN ( SELECT profiles.law_firm_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: messages Users can view messages in their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))));


--
-- Name: profiles Users can view profiles in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view profiles in their law firm" ON public.profiles FOR SELECT TO authenticated USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: user_roles Users can view roles in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view roles in their law firm" ON public.user_roles FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_roles.user_id) AND (p.law_firm_id = public.get_user_law_firm_id(auth.uid()))))));


--
-- Name: status_follow_ups Users can view status follow-ups in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view status follow-ups in their law firm" ON public.status_follow_ups FOR SELECT USING (((auth.uid() IS NOT NULL) AND (law_firm_id = public.get_user_law_firm_id(auth.uid()))));


--
-- Name: custom_statuses Users can view statuses in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view statuses in their law firm" ON public.custom_statuses FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: tags Users can view tags in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view tags in their law firm" ON public.tags FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: templates Users can view templates in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view templates in their law firm" ON public.templates FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: tray_commerce_audit_logs Users can view their audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their audit logs" ON public.tray_commerce_audit_logs FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: tray_coupon_map Users can view their connection coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their connection coupons" ON public.tray_coupon_map FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tray_commerce_connections c
  WHERE ((c.id = tray_coupon_map.connection_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))));


--
-- Name: tray_customer_map Users can view their connection customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their connection customers" ON public.tray_customer_map FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tray_commerce_connections c
  WHERE ((c.id = tray_customer_map.connection_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))));


--
-- Name: tray_order_map Users can view their connection orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their connection orders" ON public.tray_order_map FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tray_commerce_connections c
  WHERE ((c.id = tray_order_map.connection_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))));


--
-- Name: tray_product_map Users can view their connection products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their connection products" ON public.tray_product_map FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tray_commerce_connections c
  WHERE ((c.id = tray_product_map.connection_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))));


--
-- Name: tray_commerce_sync_state Users can view their connection sync state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their connection sync state" ON public.tray_commerce_sync_state FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tray_commerce_connections c
  WHERE ((c.id = tray_commerce_sync_state.connection_id) AND (c.law_firm_id = public.get_user_law_firm_id(auth.uid()))))));


--
-- Name: law_firms Users can view their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their law firm" ON public.law_firms FOR SELECT USING (((auth.uid() IS NOT NULL) AND (id = public.get_user_law_firm_id(auth.uid()))));


--
-- Name: tray_commerce_connections Users can view their law firm connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their law firm connections" ON public.tray_commerce_connections FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: google_calendar_events Users can view their law firm events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their law firm events" ON public.google_calendar_events FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: google_calendar_integrations Users can view their law firm integration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their law firm integration" ON public.google_calendar_integrations FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: google_calendar_ai_logs Users can view their law firm logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their law firm logs" ON public.google_calendar_ai_logs FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: tray_chat_integrations Users can view their law firm tray integration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their law firm tray integration" ON public.tray_chat_integrations FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: notifications Users can view their notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their notifications" ON public.notifications FOR SELECT USING (((user_id = auth.uid()) OR (admin_user_id = auth.uid()) OR public.is_admin(auth.uid())));


--
-- Name: companies Users can view their own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own company" ON public.companies FOR SELECT TO authenticated USING ((law_firm_id IN ( SELECT profiles.law_firm_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: law_firms Users can view their own law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own law firm" ON public.law_firms FOR SELECT USING ((((auth.uid() IS NOT NULL) AND (id = public.get_user_law_firm_id(auth.uid()))) OR public.is_admin(auth.uid())));


--
-- Name: tray_commerce_webhook_logs Users can view their webhook logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their webhook logs" ON public.tray_commerce_webhook_logs FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: ai_transfer_logs Users can view transfer logs in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view transfer logs in their law firm" ON public.ai_transfer_logs FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: usage_records Users can view usage in their law firm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view usage in their law firm" ON public.usage_records FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: admin_notification_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_notification_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_knowledge; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_template_base; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_template_base ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_template_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_template_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_transfer_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_transfer_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: automations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

--
-- Name: cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

--
-- Name: client_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: client_memories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_memories ENABLE ROW LEVEL SECURITY;

--
-- Name: client_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: consent_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_statuses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_statuses ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: evolution_api_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evolution_api_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: google_calendar_ai_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_calendar_ai_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: google_calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: google_calendar_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_calendar_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: instance_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instance_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: kanban_columns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;

--
-- Name: law_firm_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.law_firm_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: law_firms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.law_firms ENABLE ROW LEVEL SECURITY;

--
-- Name: member_departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_departments ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_follow_ups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scheduled_follow_ups ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_follow_ups scheduled_follow_ups_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scheduled_follow_ups_delete ON public.scheduled_follow_ups FOR DELETE USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: scheduled_follow_ups scheduled_follow_ups_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scheduled_follow_ups_insert ON public.scheduled_follow_ups FOR INSERT WITH CHECK ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: scheduled_follow_ups scheduled_follow_ups_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scheduled_follow_ups_select ON public.scheduled_follow_ups FOR SELECT USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: scheduled_follow_ups scheduled_follow_ups_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scheduled_follow_ups_update ON public.scheduled_follow_ups FOR UPDATE USING ((law_firm_id = public.get_user_law_firm_id(auth.uid())));


--
-- Name: status_follow_ups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.status_follow_ups ENABLE ROW LEVEL SECURITY;

--
-- Name: system_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: template_knowledge_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.template_knowledge_items ENABLE ROW LEVEL SECURITY;

--
-- Name: templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

--
-- Name: tray_chat_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tray_chat_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: tray_chat_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tray_chat_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: tray_commerce_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tray_commerce_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: tray_commerce_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tray_commerce_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: tray_commerce_sync_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tray_commerce_sync_state ENABLE ROW LEVEL SECURITY;

--
-- Name: tray_commerce_webhook_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tray_commerce_webhook_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: tray_coupon_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tray_coupon_map ENABLE ROW LEVEL SECURITY;

--
-- Name: tray_customer_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tray_customer_map ENABLE ROW LEVEL SECURITY;

--
-- Name: tray_order_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tray_order_map ENABLE ROW LEVEL SECURITY;

--
-- Name: tray_product_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tray_product_map ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_history_monthly; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_history_monthly ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_instances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;