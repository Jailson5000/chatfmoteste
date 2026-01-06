-- Create admin role enum
CREATE TYPE public.admin_role AS ENUM ('super_admin', 'admin_operacional', 'admin_financeiro');

-- Admin profiles table
CREATE TABLE public.admin_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Admin user roles table
CREATE TABLE public.admin_user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role admin_role NOT NULL DEFAULT 'admin_operacional',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Companies table (different from law_firms - for admin management)
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_id UUID REFERENCES public.law_firms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    document TEXT,
    email TEXT,
    phone TEXT,
    plan_id UUID,
    status TEXT NOT NULL DEFAULT 'active',
    max_users INTEGER DEFAULT 5,
    max_instances INTEGER DEFAULT 2,
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Plans table
CREATE TABLE public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    billing_period TEXT NOT NULL DEFAULT 'monthly',
    max_users INTEGER DEFAULT 5,
    max_instances INTEGER DEFAULT 2,
    max_messages INTEGER,
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add plan_id foreign key to companies
ALTER TABLE public.companies 
ADD CONSTRAINT companies_plan_id_fkey 
FOREIGN KEY (plan_id) REFERENCES public.plans(id);

-- Notifications table
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    admin_user_id UUID,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    is_read BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- System settings table
CREATE TABLE public.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- System metrics table
CREATE TABLE public.system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name TEXT NOT NULL,
    metric_value DECIMAL(15,2) NOT NULL,
    metric_type TEXT NOT NULL DEFAULT 'gauge',
    tags JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Audit logs table
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    admin_user_id UUID,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Function to check admin role
CREATE OR REPLACE FUNCTION public.has_admin_role(_user_id UUID, _role admin_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;

-- Function to check if user is any admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_user_roles
        WHERE user_id = _user_id
    )
$$;

-- Function to get admin role
CREATE OR REPLACE FUNCTION public.get_admin_role(_user_id UUID)
RETURNS admin_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role
    FROM public.admin_user_roles
    WHERE user_id = _user_id
    LIMIT 1
$$;

-- RLS Policies for admin_profiles
CREATE POLICY "Admins can view all admin profiles"
ON public.admin_profiles FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Super admins can manage admin profiles"
ON public.admin_profiles FOR ALL
USING (has_admin_role(auth.uid(), 'super_admin'));

-- RLS Policies for admin_user_roles
CREATE POLICY "Admins can view admin roles"
ON public.admin_user_roles FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Super admins can manage admin roles"
ON public.admin_user_roles FOR ALL
USING (has_admin_role(auth.uid(), 'super_admin'));

-- RLS Policies for companies
CREATE POLICY "Admins can view companies"
ON public.companies FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage companies"
ON public.companies FOR ALL
USING (is_admin(auth.uid()));

-- RLS Policies for plans
CREATE POLICY "Anyone can view active plans"
ON public.plans FOR SELECT
USING (is_active = true OR is_admin(auth.uid()));

CREATE POLICY "Super admins can manage plans"
ON public.plans FOR ALL
USING (has_admin_role(auth.uid(), 'super_admin'));

-- RLS Policies for notifications
CREATE POLICY "Users can view their notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid() OR admin_user_id = auth.uid() OR is_admin(auth.uid()));

CREATE POLICY "Admins can manage notifications"
ON public.notifications FOR ALL
USING (is_admin(auth.uid()));

-- RLS Policies for system_settings
CREATE POLICY "Admins can view system settings"
ON public.system_settings FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Super admins can manage system settings"
ON public.system_settings FOR ALL
USING (has_admin_role(auth.uid(), 'super_admin'));

-- RLS Policies for system_metrics
CREATE POLICY "Admins can view system metrics"
ON public.system_metrics FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "System can insert metrics"
ON public.system_metrics FOR INSERT
WITH CHECK (true);

-- RLS Policies for audit_logs
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "System can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_admin_profiles_updated_at
BEFORE UPDATE ON public.admin_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_plans_updated_at
BEFORE UPDATE ON public.plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default plans
INSERT INTO public.plans (name, description, price, billing_period, max_users, max_instances, features) VALUES
('Starter', 'Plano inicial para pequenas equipes', 99.00, 'monthly', 3, 1, '["Até 3 usuários", "1 conexão WhatsApp", "Suporte por email"]'),
('Professional', 'Plano profissional para equipes em crescimento', 199.00, 'monthly', 10, 3, '["Até 10 usuários", "3 conexões WhatsApp", "Suporte prioritário", "Relatórios avançados"]'),
('Enterprise', 'Plano empresarial com recursos ilimitados', 499.00, 'monthly', 50, 10, '["Até 50 usuários", "10 conexões WhatsApp", "Suporte 24/7", "API completa", "Integrações customizadas"]');

-- Insert default system settings
INSERT INTO public.system_settings (key, value, description, category) VALUES
('maintenance_mode', 'false', 'Ativar modo de manutenção', 'general'),
('default_plan', '"starter"', 'Plano padrão para novos clientes', 'billing'),
('trial_days', '14', 'Dias de trial para novos clientes', 'billing'),
('max_file_size_mb', '25', 'Tamanho máximo de arquivo em MB', 'storage'),
('enable_ai_features', 'true', 'Habilitar recursos de IA', 'features');