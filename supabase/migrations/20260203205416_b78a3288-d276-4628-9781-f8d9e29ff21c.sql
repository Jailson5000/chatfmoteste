-- ============================================================================
-- USER DEVICE SESSIONS
-- Gerencia sessões ativas por dispositivo para proteção multi-dispositivo
-- ============================================================================

-- Tabela para rastrear sessões de dispositivos
CREATE TABLE public.user_device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT,
  ip_address INET,
  last_active_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  
  UNIQUE(user_id, device_id)
);

-- Índices para performance
CREATE INDEX idx_user_device_sessions_user ON public.user_device_sessions(user_id);
CREATE INDEX idx_user_device_sessions_active ON public.user_device_sessions(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_user_device_sessions_last_active ON public.user_device_sessions(last_active_at);

-- Habilitar RLS
ALTER TABLE public.user_device_sessions ENABLE ROW LEVEL SECURITY;

-- Política: usuários gerenciam apenas suas próprias sessões
CREATE POLICY "Users can manage own sessions"
ON public.user_device_sessions
FOR ALL
USING (user_id = auth.uid());

-- ============================================================================
-- FUNÇÃO: check_device_session
-- Verifica se há sessão ativa em outro dispositivo e registra sessão atual
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_device_session(
  _user_id UUID,
  _device_id TEXT,
  _device_name TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _existing_session record;
BEGIN
  -- Validar que o chamador é o próprio usuário
  IF auth.uid() != _user_id THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'unauthorized');
  END IF;

  -- Buscar outra sessão ativa em dispositivo diferente
  SELECT * INTO _existing_session
  FROM public.user_device_sessions
  WHERE user_id = _user_id
    AND device_id != _device_id
    AND is_active = true
    AND last_active_at > now() - interval '15 minutes'
  ORDER BY last_active_at DESC
  LIMIT 1;
  
  IF _existing_session.id IS NOT NULL THEN
    -- Há sessão ativa em outro dispositivo
    RETURN jsonb_build_object(
      'allowed', false,
      'conflict', true,
      'conflicting_device', _existing_session.device_name,
      'conflicting_device_id', _existing_session.device_id,
      'last_active', _existing_session.last_active_at
    );
  END IF;
  
  -- Registrar/atualizar sessão atual
  INSERT INTO public.user_device_sessions (user_id, device_id, device_name, last_active_at)
  VALUES (_user_id, _device_id, _device_name, now())
  ON CONFLICT (user_id, device_id) 
  DO UPDATE SET 
    last_active_at = now(),
    device_name = COALESCE(EXCLUDED.device_name, public.user_device_sessions.device_name),
    is_active = true;
  
  RETURN jsonb_build_object('allowed', true, 'conflict', false);
END;
$$;

-- ============================================================================
-- FUNÇÃO: invalidate_other_sessions
-- Invalida todas as sessões do usuário exceto a do dispositivo especificado
-- ============================================================================
CREATE OR REPLACE FUNCTION public.invalidate_other_sessions(
  _user_id UUID, 
  _keep_device_id TEXT
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count integer;
BEGIN
  -- Validar que o chamador é o próprio usuário
  IF auth.uid() != _user_id THEN
    RETURN 0;
  END IF;

  UPDATE public.user_device_sessions
  SET is_active = false
  WHERE user_id = _user_id
    AND device_id != _keep_device_id;
  
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

-- ============================================================================
-- FUNÇÃO: clear_device_session
-- Limpa a sessão do dispositivo atual (logout)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.clear_device_session(
  _user_id UUID,
  _device_id TEXT
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validar que o chamador é o próprio usuário
  IF auth.uid() != _user_id THEN
    RETURN false;
  END IF;

  UPDATE public.user_device_sessions
  SET is_active = false
  WHERE user_id = _user_id
    AND device_id = _device_id;
  
  RETURN true;
END;
$$;