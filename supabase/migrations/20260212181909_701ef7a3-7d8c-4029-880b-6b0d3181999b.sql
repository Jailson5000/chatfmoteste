
-- Create meta_connections table for Instagram, Facebook, and WhatsApp Cloud API integrations
CREATE TABLE public.meta_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('instagram', 'facebook', 'whatsapp_cloud')),
  page_id TEXT NOT NULL,
  page_name TEXT,
  ig_account_id TEXT,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  default_status_id UUID REFERENCES public.custom_statuses(id) ON DELETE SET NULL,
  default_automation_id UUID REFERENCES public.automations(id) ON DELETE SET NULL,
  default_handler_type TEXT DEFAULT 'ai',
  default_human_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (law_firm_id, type, page_id)
);

-- Enable RLS
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own tenant meta connections"
  ON public.meta_connections FOR SELECT
  USING (law_firm_id IN (SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert meta connections for their tenant"
  ON public.meta_connections FOR INSERT
  WITH CHECK (law_firm_id IN (SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update their own tenant meta connections"
  ON public.meta_connections FOR UPDATE
  USING (law_firm_id IN (SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete their own tenant meta connections"
  ON public.meta_connections FOR DELETE
  USING (law_firm_id IN (SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Global admins can access all meta connections"
  ON public.meta_connections FOR ALL
  USING (public.is_admin(auth.uid()));

-- Indexes
CREATE INDEX idx_meta_connections_page_id ON public.meta_connections (page_id, type, is_active);
CREATE INDEX idx_meta_connections_law_firm ON public.meta_connections (law_firm_id, is_active);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_meta_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_meta_connections_updated_at
  BEFORE UPDATE ON public.meta_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_meta_connections_updated_at();
