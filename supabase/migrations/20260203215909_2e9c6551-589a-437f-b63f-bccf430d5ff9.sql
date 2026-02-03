-- ============================================================================
-- FIX: Device session RPCs to handle NULL law_firm_id gracefully
-- This prevents issues with global admin users and edge cases
-- ============================================================================

-- Drop and recreate check_device_session with NULL handling
CREATE OR REPLACE FUNCTION public.check_device_session(
  _user_id uuid, 
  _device_id text, 
  _device_name text DEFAULT NULL::text, 
  _law_firm_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _existing_session record;
  _effective_law_firm_id UUID;
BEGIN
  -- Validar que o chamador é o próprio usuário
  IF auth.uid() != _user_id THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'unauthorized');
  END IF;
  
  -- Se não foi passado law_firm_id, buscar do profile
  IF _law_firm_id IS NULL THEN
    SELECT law_firm_id INTO _effective_law_firm_id
    FROM public.profiles WHERE id = _user_id;
  ELSE
    _effective_law_firm_id := _law_firm_id;
  END IF;

  -- NOVO: Se law_firm_id ainda for NULL (ex: admin global), permitir acesso sem registrar sessão
  IF _effective_law_firm_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true, 
      'conflict', false, 
      'skipped', true,
      'reason', 'no_law_firm_id'
    );
  END IF;

  -- Buscar sessão ativa em OUTRO dispositivo para MESMA empresa
  SELECT * INTO _existing_session
  FROM public.user_device_sessions
  WHERE user_id = _user_id
    AND law_firm_id = _effective_law_firm_id
    AND device_id != _device_id
    AND is_active = true
    AND last_active_at > now() - interval '15 minutes'
  ORDER BY last_active_at DESC
  LIMIT 1;
  
  IF _existing_session.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'conflict', true,
      'conflicting_device', _existing_session.device_name,
      'conflicting_device_id', _existing_session.device_id,
      'last_active', _existing_session.last_active_at
    );
  END IF;
  
  -- Registrar/atualizar sessão atual (só se temos law_firm_id válido)
  INSERT INTO public.user_device_sessions (user_id, device_id, device_name, law_firm_id, last_active_at)
  VALUES (_user_id, _device_id, _device_name, _effective_law_firm_id, now())
  ON CONFLICT (user_id, device_id, law_firm_id) 
  DO UPDATE SET 
    last_active_at = now(),
    device_name = COALESCE(EXCLUDED.device_name, public.user_device_sessions.device_name),
    is_active = true;
  
  RETURN jsonb_build_object('allowed', true, 'conflict', false);
END;
$function$;

-- Update invalidate_other_sessions to handle NULL law_firm_id
CREATE OR REPLACE FUNCTION public.invalidate_other_sessions(
  _user_id uuid, 
  _keep_device_id text,
  _law_firm_id uuid DEFAULT NULL::uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _count integer;
  _effective_law_firm_id uuid;
BEGIN
  -- Validar que o chamador é o próprio usuário
  IF auth.uid() != _user_id THEN
    RETURN 0;
  END IF;

  -- Se não foi passado law_firm_id, buscar do profile
  IF _law_firm_id IS NULL THEN
    SELECT law_firm_id INTO _effective_law_firm_id
    FROM public.profiles WHERE id = _user_id;
  ELSE
    _effective_law_firm_id := _law_firm_id;
  END IF;

  -- Se law_firm_id for NULL, não há sessões para invalidar
  IF _effective_law_firm_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.user_device_sessions
  SET is_active = false
  WHERE user_id = _user_id
    AND law_firm_id = _effective_law_firm_id
    AND device_id != _keep_device_id;
  
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$function$;

-- Update clear_device_session to handle NULL law_firm_id
CREATE OR REPLACE FUNCTION public.clear_device_session(
  _user_id uuid, 
  _device_id text,
  _law_firm_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _effective_law_firm_id uuid;
BEGIN
  -- Validar que o chamador é o próprio usuário
  IF auth.uid() != _user_id THEN
    RETURN false;
  END IF;

  -- Se não foi passado law_firm_id, buscar do profile
  IF _law_firm_id IS NULL THEN
    SELECT law_firm_id INTO _effective_law_firm_id
    FROM public.profiles WHERE id = _user_id;
  ELSE
    _effective_law_firm_id := _law_firm_id;
  END IF;

  -- Se law_firm_id for NULL, não há sessão para limpar
  IF _effective_law_firm_id IS NULL THEN
    RETURN true; -- Consideramos sucesso pois não há nada para limpar
  END IF;

  UPDATE public.user_device_sessions
  SET is_active = false
  WHERE user_id = _user_id
    AND device_id = _device_id
    AND law_firm_id = _effective_law_firm_id;
  
  RETURN true;
END;
$function$;

-- Limpar sessões órfãs com law_firm_id NULL (limpeza de dados antigos)
DELETE FROM public.user_device_sessions 
WHERE law_firm_id IS NULL 
  AND created_at < now() - interval '7 days';

-- Adicionar índice para melhorar performance das consultas de sessão
CREATE INDEX IF NOT EXISTS idx_user_device_sessions_active_lookup 
ON public.user_device_sessions (user_id, law_firm_id, is_active, last_active_at DESC)
WHERE is_active = true;