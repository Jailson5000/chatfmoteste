-- Tabela para registrar acessos de impersonation
CREATE TABLE public.impersonation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  target_company_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_impersonation_logs_admin ON public.impersonation_logs(admin_user_id);
CREATE INDEX idx_impersonation_logs_target ON public.impersonation_logs(target_user_id);
CREATE INDEX idx_impersonation_logs_company ON public.impersonation_logs(target_company_id);
CREATE INDEX idx_impersonation_logs_started ON public.impersonation_logs(started_at DESC);

-- Comentário na tabela
COMMENT ON TABLE public.impersonation_logs IS 'Registro de todos os acessos de super admins a contas de clientes';

-- Enable RLS
ALTER TABLE public.impersonation_logs ENABLE ROW LEVEL SECURITY;

-- Apenas super_admins podem ver os logs
CREATE POLICY "Super admins can view impersonation logs"
ON public.impersonation_logs FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Apenas a edge function pode inserir (via service role)
CREATE POLICY "Service role can insert impersonation logs"
ON public.impersonation_logs FOR INSERT
TO authenticated
WITH CHECK (public.has_admin_role(auth.uid(), 'super_admin'));