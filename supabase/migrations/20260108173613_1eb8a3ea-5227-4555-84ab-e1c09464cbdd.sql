-- =============================================
-- SISTEMA DE AGENDAMENTO INTELIGENTE
-- =============================================

-- Tabela de Serviços oferecidos pela empresa
CREATE TABLE public.services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
  buffer_after_minutes INTEGER NOT NULL DEFAULT 0,
  price DECIMAL(10,2),
  color TEXT NOT NULL DEFAULT '#6366f1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de Agendamentos
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  google_event_id TEXT,
  
  -- Dados do agendamento
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Dados do cliente (para agendamentos sem client_id)
  client_name TEXT,
  client_phone TEXT,
  client_email TEXT,
  
  -- Status e notas
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  notes TEXT,
  
  -- Automação
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  confirmation_sent_at TIMESTAMP WITH TIME ZONE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancel_reason TEXT,
  
  -- Metadados
  created_by TEXT NOT NULL DEFAULT 'system' CHECK (created_by IN ('system', 'admin', 'client', 'ai')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_services_law_firm ON public.services(law_firm_id);
CREATE INDEX idx_services_active ON public.services(law_firm_id, is_active);
CREATE INDEX idx_appointments_law_firm ON public.appointments(law_firm_id);
CREATE INDEX idx_appointments_service ON public.appointments(service_id);
CREATE INDEX idx_appointments_client ON public.appointments(client_id);
CREATE INDEX idx_appointments_time ON public.appointments(law_firm_id, start_time, end_time);
CREATE INDEX idx_appointments_status ON public.appointments(law_firm_id, status);
CREATE INDEX idx_appointments_google_event ON public.appointments(google_event_id);

-- RLS para services
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view services in their law firm"
ON public.services FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can manage services"
ON public.services FOR ALL
USING (law_firm_id = get_user_law_firm_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- RLS para appointments
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view appointments in their law firm"
ON public.appointments FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can manage appointments in their law firm"
ON public.appointments FOR ALL
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_services_updated_at
BEFORE UPDATE ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime para sincronização
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;