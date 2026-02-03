-- ============================================================================
-- Migração: Proteção Multi-Dispositivo por Empresa (law_firm_id)
-- ============================================================================

-- 1. Adicionar coluna law_firm_id à tabela user_device_sessions
ALTER TABLE public.user_device_sessions 
ADD COLUMN IF NOT EXISTS law_firm_id UUID REFERENCES public.law_firms(id) ON DELETE CASCADE;

-- 2. Remover constraint antiga (user_id, device_id)
ALTER TABLE public.user_device_sessions 
DROP CONSTRAINT IF EXISTS user_device_sessions_user_id_device_id_key;

-- 3. Adicionar nova constraint única (user_id, law_firm_id, device_id)
ALTER TABLE public.user_device_sessions 
ADD CONSTRAINT user_device_sessions_user_law_firm_device_key 
UNIQUE(user_id, law_firm_id, device_id);

-- 4. Índice para performance nas consultas de sessões ativas
CREATE INDEX IF NOT EXISTS idx_user_device_sessions_law_firm 
ON public.user_device_sessions(user_id, law_firm_id, is_active) 
WHERE is_active = true;

-- 5. Atualizar função check_device_session para filtrar por law_firm_id
CREATE OR REPLACE FUNCTION public.check_device_session(
  _user_id UUID,
  _device_id TEXT,
  _device_name TEXT DEFAULT NULL,
  _law_firm_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  
  -- Registrar sessão com law_firm_id
  INSERT INTO public.user_device_sessions 
    (user_id, law_firm_id, device_id, device_name, last_active_at)
  VALUES 
    (_user_id, _effective_law_firm_id, _device_id, _device_name, now())
  ON CONFLICT (user_id, law_firm_id, device_id) 
  DO UPDATE SET 
    last_active_at = now(),
    device_name = COALESCE(EXCLUDED.device_name, user_device_sessions.device_name),
    is_active = true;
  
  RETURN jsonb_build_object('allowed', true, 'conflict', false);
END;
$$;

-- 6. Atualizar função invalidate_other_sessions para filtrar por law_firm_id
CREATE OR REPLACE FUNCTION public.invalidate_other_sessions(
  _user_id UUID, 
  _keep_device_id TEXT,
  _law_firm_id UUID DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count integer;
  _effective_law_firm_id UUID;
BEGIN
  IF auth.uid() != _user_id THEN
    RETURN 0;
  END IF;
  
  -- Se não foi passado, buscar do profile
  IF _law_firm_id IS NULL THEN
    SELECT law_firm_id INTO _effective_law_firm_id
    FROM public.profiles WHERE id = _user_id;
  ELSE
    _effective_law_firm_id := _law_firm_id;
  END IF;

  UPDATE public.user_device_sessions
  SET is_active = false
  WHERE user_id = _user_id
    AND law_firm_id = _effective_law_firm_id
    AND device_id != _keep_device_id;
  
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

-- 7. Atualizar função clear_device_session para filtrar por law_firm_id
CREATE OR REPLACE FUNCTION public.clear_device_session(
  _user_id UUID, 
  _device_id TEXT,
  _law_firm_id UUID DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _effective_law_firm_id UUID;
BEGIN
  -- Validar que o chamador é o próprio usuário
  IF auth.uid() != _user_id THEN
    RETURN false;
  END IF;

  -- Se não foi passado, buscar do profile
  IF _law_firm_id IS NULL THEN
    SELECT law_firm_id INTO _effective_law_firm_id
    FROM public.profiles WHERE id = _user_id;
  ELSE
    _effective_law_firm_id := _law_firm_id;
  END IF;

  UPDATE public.user_device_sessions
  SET is_active = false
  WHERE user_id = _user_id
    AND law_firm_id = _effective_law_firm_id
    AND device_id = _device_id;
  
  RETURN true;
END;
$$;