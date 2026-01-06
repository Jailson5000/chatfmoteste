-- Adicionar colunas de limites customizados na tabela companies
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS use_custom_limits boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS max_agents integer,
ADD COLUMN IF NOT EXISTS max_workspaces integer,
ADD COLUMN IF NOT EXISTS max_ai_conversations integer,
ADD COLUMN IF NOT EXISTS max_tts_minutes integer;

-- Comentários nas colunas
COMMENT ON COLUMN public.companies.use_custom_limits IS 'Se true, usa os limites customizados ao invés dos limites do plano';
COMMENT ON COLUMN public.companies.max_agents IS 'Limite customizado de agentes de IA (override do plano)';
COMMENT ON COLUMN public.companies.max_workspaces IS 'Limite customizado de workspaces (override do plano)';
COMMENT ON COLUMN public.companies.max_ai_conversations IS 'Limite customizado de conversas IA/mês (override do plano)';
COMMENT ON COLUMN public.companies.max_tts_minutes IS 'Limite customizado de minutos TTS/mês (override do plano)';

-- Criar view para facilitar consulta de uso atual por empresa
-- Usando status ao invés de is_active para whatsapp_instances
CREATE OR REPLACE VIEW public.company_usage_summary AS
SELECT 
  c.id as company_id,
  c.law_firm_id,
  c.name as company_name,
  c.plan_id,
  p.name as plan_name,
  c.use_custom_limits,
  -- Limites efetivos (customizado ou do plano)
  CASE WHEN c.use_custom_limits AND c.max_users IS NOT NULL THEN c.max_users ELSE COALESCE(p.max_users, 5) END as effective_max_users,
  CASE WHEN c.use_custom_limits AND c.max_instances IS NOT NULL THEN c.max_instances ELSE COALESCE(p.max_instances, 2) END as effective_max_instances,
  CASE WHEN c.use_custom_limits AND c.max_agents IS NOT NULL THEN c.max_agents ELSE COALESCE(p.max_agents, 1) END as effective_max_agents,
  CASE WHEN c.use_custom_limits AND c.max_workspaces IS NOT NULL THEN c.max_workspaces ELSE COALESCE(p.max_workspaces, 1) END as effective_max_workspaces,
  CASE WHEN c.use_custom_limits AND c.max_ai_conversations IS NOT NULL THEN c.max_ai_conversations ELSE COALESCE(p.max_ai_conversations, 250) END as effective_max_ai_conversations,
  CASE WHEN c.use_custom_limits AND c.max_tts_minutes IS NOT NULL THEN c.max_tts_minutes ELSE COALESCE(p.max_tts_minutes, 40) END as effective_max_tts_minutes,
  -- Contagens atuais
  (SELECT COUNT(*) FROM public.profiles pr WHERE pr.law_firm_id = c.law_firm_id AND pr.is_active = true) as current_users,
  (SELECT COUNT(*) FROM public.whatsapp_instances wi WHERE wi.law_firm_id = c.law_firm_id AND wi.status = 'connected') as current_instances,
  (SELECT COUNT(*) FROM public.automations a WHERE a.law_firm_id = c.law_firm_id AND a.is_active = true) as current_agents,
  -- Uso mensal de IA (período atual)
  (
    SELECT COALESCE(SUM(ur.count), 0) 
    FROM public.usage_records ur 
    WHERE ur.law_firm_id = c.law_firm_id 
    AND ur.usage_type = 'ai_conversation'
    AND ur.billing_period = to_char(now(), 'YYYY-MM')
  ) as current_ai_conversations,
  (
    SELECT COALESCE(ROUND(SUM(ur.duration_seconds) / 60.0, 2), 0) 
    FROM public.usage_records ur 
    WHERE ur.law_firm_id = c.law_firm_id 
    AND ur.usage_type = 'tts_audio'
    AND ur.billing_period = to_char(now(), 'YYYY-MM')
  ) as current_tts_minutes
FROM public.companies c
LEFT JOIN public.plans p ON c.plan_id = p.id
WHERE c.law_firm_id IS NOT NULL;

-- Criar função para verificar se empresa pode realizar ação
CREATE OR REPLACE FUNCTION public.check_company_limit(
  _law_firm_id uuid,
  _limit_type text,
  _increment integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Criar tabela de histórico mensal de uso
CREATE TABLE IF NOT EXISTS public.usage_history_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  law_firm_id uuid NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  billing_period text NOT NULL,
  ai_conversations integer DEFAULT 0,
  tts_minutes numeric DEFAULT 0,
  transcriptions integer DEFAULT 0,
  max_users_snapshot integer,
  max_instances_snapshot integer,
  max_agents_snapshot integer,
  closed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(law_firm_id, billing_period)
);

-- RLS para usage_history_monthly
ALTER TABLE public.usage_history_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view usage history"
  ON public.usage_history_monthly
  FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "System can manage usage history"
  ON public.usage_history_monthly
  FOR ALL
  USING (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_usage_history_period ON public.usage_history_monthly(billing_period);
CREATE INDEX IF NOT EXISTS idx_usage_history_law_firm ON public.usage_history_monthly(law_firm_id);