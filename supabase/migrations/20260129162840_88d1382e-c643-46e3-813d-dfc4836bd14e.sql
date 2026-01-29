-- ============================================
-- Sistema de Solicitação de Adicionais
-- ============================================

-- 1. Criar tabela addon_requests
CREATE TABLE public.addon_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Quantidades solicitadas
  additional_users INTEGER NOT NULL DEFAULT 0,
  additional_instances INTEGER NOT NULL DEFAULT 0,
  -- Valor calculado
  monthly_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  -- Status do fluxo
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  -- Ações do admin
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices para performance
CREATE INDEX idx_addon_requests_company_id ON public.addon_requests(company_id);
CREATE INDEX idx_addon_requests_law_firm_id ON public.addon_requests(law_firm_id);
CREATE INDEX idx_addon_requests_status ON public.addon_requests(status);
CREATE INDEX idx_addon_requests_created_at ON public.addon_requests(created_at DESC);

-- 3. Trigger para atualizar updated_at
CREATE TRIGGER update_addon_requests_updated_at
  BEFORE UPDATE ON public.addon_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Habilitar RLS
ALTER TABLE public.addon_requests ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS
-- Clientes podem ver suas próprias solicitações
CREATE POLICY "Users can view own law firm addon requests"
  ON public.addon_requests FOR SELECT
  TO authenticated
  USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- Clientes podem criar solicitações para sua própria empresa
CREATE POLICY "Users can create addon requests for own law firm"
  ON public.addon_requests FOR INSERT
  TO authenticated
  WITH CHECK (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- Clientes podem cancelar suas próprias solicitações pendentes
CREATE POLICY "Users can cancel own pending addon requests"
  ON public.addon_requests FOR UPDATE
  TO authenticated
  USING (
    law_firm_id = public.get_user_law_firm_id(auth.uid())
    AND status = 'pending'
  )
  WITH CHECK (status = 'cancelled');

-- Global Admins podem ver todas as solicitações
CREATE POLICY "Global admins can view all addon requests"
  ON public.addon_requests FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Global Admins podem atualizar todas as solicitações
CREATE POLICY "Global admins can update all addon requests"
  ON public.addon_requests FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- 6. Trigger para notificar Global Admin quando nova solicitação é criada
CREATE OR REPLACE FUNCTION public.notify_admin_addon_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_name text;
  _cost_text text;
BEGIN
  -- Get company name
  SELECT name INTO _company_name FROM public.companies WHERE id = NEW.company_id;
  
  -- Format cost
  _cost_text := 'R$ ' || REPLACE(NEW.monthly_cost::text, '.', ',');
  
  -- Insert notification for all global admins (admin_user_id = null means broadcast)
  INSERT INTO public.notifications (
    user_id,
    admin_user_id,
    title,
    message,
    type,
    is_read,
    metadata
  ) VALUES (
    null,
    null,
    'Nova Solicitação de Adicional',
    'Empresa "' || COALESCE(_company_name, 'Desconhecida') || '" solicitou adicionais: ' ||
      CASE WHEN NEW.additional_users > 0 THEN NEW.additional_users || ' usuário(s) ' ELSE '' END ||
      CASE WHEN NEW.additional_instances > 0 THEN NEW.additional_instances || ' conexão(ões) WhatsApp' ELSE '' END ||
      ' - Valor: ' || _cost_text || '/mês',
    'ADDON_REQUEST',
    false,
    jsonb_build_object(
      'addon_request_id', NEW.id,
      'company_id', NEW.company_id,
      'company_name', _company_name,
      'additional_users', NEW.additional_users,
      'additional_instances', NEW.additional_instances,
      'monthly_cost', NEW.monthly_cost
    )
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_admin_addon_request
  AFTER INSERT ON public.addon_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_addon_request();

-- 7. Função para aprovar solicitação (atualiza limites da empresa)
CREATE OR REPLACE FUNCTION public.approve_addon_request(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request record;
  _company record;
  _new_max_users integer;
  _new_max_instances integer;
BEGIN
  -- Verificar se é admin global
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores globais podem aprovar solicitações');
  END IF;
  
  -- Buscar solicitação
  SELECT * INTO _request FROM public.addon_requests WHERE id = _request_id;
  
  IF _request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação não encontrada');
  END IF;
  
  IF _request.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação já foi processada');
  END IF;
  
  -- Buscar empresa
  SELECT * INTO _company FROM public.companies WHERE id = _request.company_id;
  
  IF _company IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Empresa não encontrada');
  END IF;
  
  -- Calcular novos limites
  _new_max_users := COALESCE(_company.max_users, 5) + _request.additional_users;
  _new_max_instances := COALESCE(_company.max_instances, 2) + _request.additional_instances;
  
  -- Atualizar limites da empresa
  UPDATE public.companies
  SET 
    max_users = _new_max_users,
    max_instances = _new_max_instances,
    use_custom_limits = true,
    updated_at = now()
  WHERE id = _request.company_id;
  
  -- Marcar solicitação como aprovada
  UPDATE public.addon_requests
  SET 
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = _request_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'new_max_users', _new_max_users,
    'new_max_instances', _new_max_instances,
    'company_name', _company.name
  );
END;
$$;

-- 8. Função para rejeitar solicitação
CREATE OR REPLACE FUNCTION public.reject_addon_request(_request_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request record;
BEGIN
  -- Verificar se é admin global
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores globais podem rejeitar solicitações');
  END IF;
  
  -- Buscar solicitação
  SELECT * INTO _request FROM public.addon_requests WHERE id = _request_id;
  
  IF _request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação não encontrada');
  END IF;
  
  IF _request.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação já foi processada');
  END IF;
  
  -- Marcar como rejeitada
  UPDATE public.addon_requests
  SET 
    status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    rejection_reason = _reason
  WHERE id = _request_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;