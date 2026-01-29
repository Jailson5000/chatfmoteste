-- Tabela de assinaturas ASAAS
CREATE TABLE public.company_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  asaas_customer_id text,
  asaas_subscription_id text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled', 'overdue', 'trial')),
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  last_payment_at timestamp with time zone,
  next_payment_at timestamp with time zone,
  plan_id uuid REFERENCES public.plans(id),
  billing_type text DEFAULT 'monthly' CHECK (billing_type IN ('monthly', 'yearly')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_company_subscriptions_company ON public.company_subscriptions(company_id);
CREATE INDEX idx_company_subscriptions_asaas_customer ON public.company_subscriptions(asaas_customer_id);
CREATE INDEX idx_company_subscriptions_asaas_subscription ON public.company_subscriptions(asaas_subscription_id);
CREATE INDEX idx_company_subscriptions_status ON public.company_subscriptions(status);

-- Enable RLS
ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Global admins can manage all subscriptions"
ON public.company_subscriptions
FOR ALL
USING (public.is_admin(auth.uid()));

CREATE POLICY "Company admins can view their subscription"
ON public.company_subscriptions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.law_firms lf ON lf.id = p.law_firm_id
    JOIN public.companies c ON c.id = company_id
    WHERE p.id = auth.uid()
    AND lf.id = c.law_firm_id
  )
);

-- Trigger para updated_at
CREATE TRIGGER update_company_subscriptions_updated_at
  BEFORE UPDATE ON public.company_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Configuração para auto-aprovação de trial
INSERT INTO public.system_settings (key, value, category, description)
VALUES ('auto_approve_trial_enabled', 'false', 'registration', 
        'Quando ativado, empresas que escolhem trial são aprovadas automaticamente sem intervenção manual')
ON CONFLICT (key) DO NOTHING;