-- Tabela para Status personalizados (para clientes/casos)
CREATE TABLE public.custom_statuses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_id uuid NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    position integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(law_firm_id, name)
);

-- Tabela para Etiquetas
CREATE TABLE public.tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_id uuid NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(law_firm_id, name)
);

-- Tabela para Departamentos (serão as colunas do Kanban)
CREATE TABLE public.departments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_id uuid NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    icon text DEFAULT 'folder',
    position integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(law_firm_id, name)
);

-- Adicionar campo de departamento e status customizado nos clientes
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS custom_status_id uuid REFERENCES public.custom_statuses(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- Tabela intermediária para etiquetas dos clientes (many-to-many)
CREATE TABLE public.client_tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(client_id, tag_id)
);

-- Enable RLS
ALTER TABLE public.custom_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tags ENABLE ROW LEVEL SECURITY;

-- Policies para custom_statuses
CREATE POLICY "Users can view statuses in their law firm"
ON public.custom_statuses FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can manage statuses"
ON public.custom_statuses FOR ALL
USING (law_firm_id = get_user_law_firm_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Policies para tags
CREATE POLICY "Users can view tags in their law firm"
ON public.tags FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can manage tags"
ON public.tags FOR ALL
USING (law_firm_id = get_user_law_firm_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Policies para departments
CREATE POLICY "Users can view departments in their law firm"
ON public.departments FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can manage departments"
ON public.departments FOR ALL
USING (law_firm_id = get_user_law_firm_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Policies para client_tags
CREATE POLICY "Users can view client tags in their law firm"
ON public.client_tags FOR SELECT
USING (EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = client_tags.client_id
    AND c.law_firm_id = get_user_law_firm_id(auth.uid())
));

CREATE POLICY "Users can manage client tags in their law firm"
ON public.client_tags FOR ALL
USING (EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = client_tags.client_id
    AND c.law_firm_id = get_user_law_firm_id(auth.uid())
));

-- Triggers para updated_at
CREATE TRIGGER update_custom_statuses_updated_at
    BEFORE UPDATE ON public.custom_statuses
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_departments_updated_at
    BEFORE UPDATE ON public.departments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();