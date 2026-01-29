-- =====================================================
-- Fix approve_addon_request to use plan limits as baseline
-- =====================================================

CREATE OR REPLACE FUNCTION public.approve_addon_request(_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _request record;
  _company record;
  _plan record;
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
  
  -- Buscar limites do plano como baseline
  SELECT max_users, max_instances INTO _plan
  FROM public.plans WHERE id = _company.plan_id;
  
  -- Calcular novos limites usando plano como fallback (não valores hardcoded)
  -- Se a empresa já tem custom limits, soma ao valor atual
  -- Se não tem, usa o limite do plano como base
  _new_max_users := COALESCE(_company.max_users, _plan.max_users, 5) + _request.additional_users;
  _new_max_instances := COALESCE(_company.max_instances, _plan.max_instances, 2) + _request.additional_instances;
  
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
    'company_name', _company.name,
    'plan_base_users', _plan.max_users,
    'plan_base_instances', _plan.max_instances
  );
END;
$function$;

-- =====================================================
-- Fix FMO Advogados data based on approved add-ons
-- Enterprise plan: max_users=10, max_instances=6
-- Approved add-ons: +4 users, +3 instances
-- =====================================================

UPDATE public.companies 
SET 
  max_users = 14,      -- 10 (plan) + 4 (approved add-ons)
  max_instances = 9,   -- 6 (plan) + 3 (approved add-ons)
  use_custom_limits = true,
  updated_at = now()
WHERE id = '08370f53-1f7c-4e72-91bc-425c8da3613b';