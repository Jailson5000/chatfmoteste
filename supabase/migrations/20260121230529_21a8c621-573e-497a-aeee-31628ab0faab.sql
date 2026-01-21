-- =============================================
-- AGENDA PRO - MÓDULO INDEPENDENTE
-- =============================================

-- Tabela de configuração da Agenda Pro por empresa
CREATE TABLE public.agenda_pro_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  business_name TEXT,
  business_description TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#6366f1',
  -- Regras inteligentes
  min_advance_hours INTEGER DEFAULT 2,
  max_advance_days INTEGER DEFAULT 60,
  min_gap_between_appointments INTEGER DEFAULT 0,
  max_daily_appointments INTEGER,
  block_holidays BOOLEAN DEFAULT false,
  require_confirmation BOOLEAN DEFAULT true,
  confirmation_deadline_hours INTEGER DEFAULT 24,
  -- Horário de funcionamento padrão
  default_start_time TIME DEFAULT '08:00',
  default_end_time TIME DEFAULT '18:00',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  -- Link público
  public_slug TEXT UNIQUE,
  public_booking_enabled BOOLEAN DEFAULT false,
  -- Mensagens personalizáveis
  confirmation_message_template TEXT DEFAULT 'Olá {client_name}! Seu agendamento para {service_name} com {professional_name} está confirmado para {date} às {time}.',
  reminder_message_template TEXT DEFAULT 'Olá {client_name}! Lembramos que você tem um agendamento para {service_name} amanhã às {time}.',
  cancellation_message_template TEXT DEFAULT 'Olá {client_name}! Seu agendamento para {service_name} em {date} foi cancelado.',
  -- Notificações
  send_whatsapp_confirmation BOOLEAN DEFAULT true,
  send_email_confirmation BOOLEAN DEFAULT false,
  send_sms_confirmation BOOLEAN DEFAULT false,
  reminder_hours_before INTEGER DEFAULT 24,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(law_firm_id)
);

-- Tabela de profissionais da Agenda Pro
CREATE TABLE public.agenda_pro_professionals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  document TEXT,
  specialty TEXT,
  bio TEXT,
  avatar_url TEXT,
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER DEFAULT 0,
  -- Notificações
  notify_new_appointment BOOLEAN DEFAULT true,
  notify_cancellation BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de horários de trabalho dos profissionais
CREATE TABLE public.agenda_pro_working_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES public.agenda_pro_professionals(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de intervalos/pausas dos profissionais
CREATE TABLE public.agenda_pro_breaks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES public.agenda_pro_professionals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  specific_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de folgas/bloqueios dos profissionais
CREATE TABLE public.agenda_pro_time_off (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES public.agenda_pro_professionals(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  is_all_day BOOLEAN NOT NULL DEFAULT true,
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de salas/recursos
CREATE TABLE public.agenda_pro_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'room',
  capacity INTEGER DEFAULT 1,
  color TEXT DEFAULT '#10b981',
  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de serviços da Agenda Pro
CREATE TABLE public.agenda_pro_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  buffer_before_minutes INTEGER DEFAULT 0,
  buffer_after_minutes INTEGER DEFAULT 0,
  price DECIMAL(10,2),
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT true,
  requires_resource BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  -- Retorno automático
  return_enabled BOOLEAN DEFAULT false,
  return_interval_days INTEGER,
  -- Mensagem pré-atendimento
  pre_message_enabled BOOLEAN DEFAULT false,
  pre_message_text TEXT,
  pre_message_hours_before INTEGER DEFAULT 2,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de relacionamento serviço-profissional
CREATE TABLE public.agenda_pro_service_professionals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID NOT NULL REFERENCES public.agenda_pro_services(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.agenda_pro_professionals(id) ON DELETE CASCADE,
  custom_duration_minutes INTEGER,
  custom_price DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(service_id, professional_id)
);

-- Tabela de relacionamento serviço-recurso
CREATE TABLE public.agenda_pro_service_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID NOT NULL REFERENCES public.agenda_pro_services(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.agenda_pro_resources(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(service_id, resource_id)
);

-- Tabela de clientes da Agenda Pro
CREATE TABLE public.agenda_pro_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  document TEXT,
  birth_date DATE,
  gender TEXT,
  address TEXT,
  notes TEXT,
  tags TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Preferências
  preferred_professional_id UUID REFERENCES public.agenda_pro_professionals(id) ON DELETE SET NULL,
  send_birthday_message BOOLEAN DEFAULT true,
  -- Métricas
  total_appointments INTEGER DEFAULT 0,
  total_no_shows INTEGER DEFAULT 0,
  last_appointment_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de agendamentos
CREATE TABLE public.agenda_pro_appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.agenda_pro_clients(id) ON DELETE SET NULL,
  professional_id UUID NOT NULL REFERENCES public.agenda_pro_professionals(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES public.agenda_pro_services(id) ON DELETE RESTRICT,
  resource_id UUID REFERENCES public.agenda_pro_resources(id) ON DELETE SET NULL,
  -- Cliente sem cadastro (agendamento rápido)
  client_name TEXT,
  client_phone TEXT,
  client_email TEXT,
  -- Datas e horários
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL,
  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled')),
  -- Confirmação
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmed_by TEXT,
  -- Cancelamento
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancelled_by TEXT,
  cancellation_reason TEXT,
  -- Atendimento
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  -- Observações
  notes TEXT,
  internal_notes TEXT,
  -- Origem
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'public_booking', 'whatsapp', 'phone', 'api')),
  -- Recorrência
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT,
  parent_appointment_id UUID REFERENCES public.agenda_pro_appointments(id) ON DELETE SET NULL,
  -- Pagamento
  price DECIMAL(10,2),
  is_paid BOOLEAN DEFAULT false,
  payment_method TEXT,
  -- Lembretes enviados
  confirmation_sent_at TIMESTAMP WITH TIME ZONE,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  pre_message_sent_at TIMESTAMP WITH TIME ZONE,
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de feriados
CREATE TABLE public.agenda_pro_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID REFERENCES public.law_firms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  is_national BOOLEAN DEFAULT false,
  is_recurring BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de histórico/log de ações
CREATE TABLE public.agenda_pro_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.agenda_pro_appointments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- ÍNDICES
-- =============================================
CREATE INDEX idx_agenda_pro_settings_law_firm ON public.agenda_pro_settings(law_firm_id);
CREATE INDEX idx_agenda_pro_settings_slug ON public.agenda_pro_settings(public_slug);
CREATE INDEX idx_agenda_pro_professionals_law_firm ON public.agenda_pro_professionals(law_firm_id);
CREATE INDEX idx_agenda_pro_professionals_active ON public.agenda_pro_professionals(law_firm_id, is_active);
CREATE INDEX idx_agenda_pro_services_law_firm ON public.agenda_pro_services(law_firm_id);
CREATE INDEX idx_agenda_pro_services_active ON public.agenda_pro_services(law_firm_id, is_active);
CREATE INDEX idx_agenda_pro_clients_law_firm ON public.agenda_pro_clients(law_firm_id);
CREATE INDEX idx_agenda_pro_clients_phone ON public.agenda_pro_clients(law_firm_id, phone);
CREATE INDEX idx_agenda_pro_appointments_law_firm ON public.agenda_pro_appointments(law_firm_id);
CREATE INDEX idx_agenda_pro_appointments_professional ON public.agenda_pro_appointments(professional_id);
CREATE INDEX idx_agenda_pro_appointments_client ON public.agenda_pro_appointments(client_id);
CREATE INDEX idx_agenda_pro_appointments_date ON public.agenda_pro_appointments(law_firm_id, start_time);
CREATE INDEX idx_agenda_pro_appointments_status ON public.agenda_pro_appointments(law_firm_id, status);
CREATE INDEX idx_agenda_pro_resources_law_firm ON public.agenda_pro_resources(law_firm_id);
CREATE INDEX idx_agenda_pro_working_hours_professional ON public.agenda_pro_working_hours(professional_id);

-- =============================================
-- RLS POLICIES
-- =============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.agenda_pro_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_pro_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_pro_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_pro_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_pro_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_pro_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_pro_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_pro_service_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_pro_service_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_pro_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_pro_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_pro_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_pro_activity_log ENABLE ROW LEVEL SECURITY;

-- Policies para agenda_pro_settings
CREATE POLICY "Users can view own company settings" ON public.agenda_pro_settings
  FOR SELECT USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));
  
CREATE POLICY "Users can update own company settings" ON public.agenda_pro_settings
  FOR UPDATE USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));
  
CREATE POLICY "Users can insert own company settings" ON public.agenda_pro_settings
  FOR INSERT WITH CHECK (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- Policy pública para busca por slug (agendamento online)
CREATE POLICY "Public can view settings by slug" ON public.agenda_pro_settings
  FOR SELECT USING (public_booking_enabled = true AND public_slug IS NOT NULL);

-- Policies para agenda_pro_professionals
CREATE POLICY "Users can view own company professionals" ON public.agenda_pro_professionals
  FOR SELECT USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));
  
CREATE POLICY "Users can manage own company professionals" ON public.agenda_pro_professionals
  FOR ALL USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- Policy pública para profissionais (agendamento online)
CREATE POLICY "Public can view active professionals" ON public.agenda_pro_professionals
  FOR SELECT USING (
    is_active = true AND 
    EXISTS (
      SELECT 1 FROM public.agenda_pro_settings s 
      WHERE s.law_firm_id = agenda_pro_professionals.law_firm_id 
      AND s.public_booking_enabled = true
    )
  );

-- Policies para agenda_pro_working_hours
CREATE POLICY "Users can view working hours" ON public.agenda_pro_working_hours
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.agenda_pro_professionals p 
      WHERE p.id = professional_id 
      AND p.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
  );
  
CREATE POLICY "Users can manage working hours" ON public.agenda_pro_working_hours
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.agenda_pro_professionals p 
      WHERE p.id = professional_id 
      AND p.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
  );

-- Policy pública para horários (agendamento online)
CREATE POLICY "Public can view working hours" ON public.agenda_pro_working_hours
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.agenda_pro_professionals p 
      JOIN public.agenda_pro_settings s ON s.law_firm_id = p.law_firm_id
      WHERE p.id = professional_id 
      AND p.is_active = true
      AND s.public_booking_enabled = true
    )
  );

-- Policies para agenda_pro_breaks
CREATE POLICY "Users can view breaks" ON public.agenda_pro_breaks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.agenda_pro_professionals p 
      WHERE p.id = professional_id 
      AND p.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
  );
  
CREATE POLICY "Users can manage breaks" ON public.agenda_pro_breaks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.agenda_pro_professionals p 
      WHERE p.id = professional_id 
      AND p.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
  );

-- Policies para agenda_pro_time_off
CREATE POLICY "Users can view time off" ON public.agenda_pro_time_off
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.agenda_pro_professionals p 
      WHERE p.id = professional_id 
      AND p.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
  );
  
CREATE POLICY "Users can manage time off" ON public.agenda_pro_time_off
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.agenda_pro_professionals p 
      WHERE p.id = professional_id 
      AND p.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
  );

-- Policy pública para folgas (agendamento online)
CREATE POLICY "Public can view time off" ON public.agenda_pro_time_off
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.agenda_pro_professionals p 
      JOIN public.agenda_pro_settings s ON s.law_firm_id = p.law_firm_id
      WHERE p.id = professional_id 
      AND s.public_booking_enabled = true
    )
  );

-- Policies para agenda_pro_resources
CREATE POLICY "Users can view own company resources" ON public.agenda_pro_resources
  FOR SELECT USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));
  
CREATE POLICY "Users can manage own company resources" ON public.agenda_pro_resources
  FOR ALL USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- Policies para agenda_pro_services
CREATE POLICY "Users can view own company services" ON public.agenda_pro_services
  FOR SELECT USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));
  
CREATE POLICY "Users can manage own company services" ON public.agenda_pro_services
  FOR ALL USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- Policy pública para serviços (agendamento online)
CREATE POLICY "Public can view public services" ON public.agenda_pro_services
  FOR SELECT USING (
    is_active = true AND 
    is_public = true AND
    EXISTS (
      SELECT 1 FROM public.agenda_pro_settings s 
      WHERE s.law_firm_id = agenda_pro_services.law_firm_id 
      AND s.public_booking_enabled = true
    )
  );

-- Policies para agenda_pro_service_professionals
CREATE POLICY "Users can view service professionals" ON public.agenda_pro_service_professionals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.agenda_pro_services s 
      WHERE s.id = service_id 
      AND s.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
  );
  
CREATE POLICY "Users can manage service professionals" ON public.agenda_pro_service_professionals
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.agenda_pro_services s 
      WHERE s.id = service_id 
      AND s.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
  );

-- Policy pública para service_professionals
CREATE POLICY "Public can view service professionals" ON public.agenda_pro_service_professionals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.agenda_pro_services s 
      JOIN public.agenda_pro_settings st ON st.law_firm_id = s.law_firm_id
      WHERE s.id = service_id 
      AND s.is_active = true
      AND s.is_public = true
      AND st.public_booking_enabled = true
    )
  );

-- Policies para agenda_pro_service_resources
CREATE POLICY "Users can view service resources" ON public.agenda_pro_service_resources
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.agenda_pro_services s 
      WHERE s.id = service_id 
      AND s.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
  );
  
CREATE POLICY "Users can manage service resources" ON public.agenda_pro_service_resources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.agenda_pro_services s 
      WHERE s.id = service_id 
      AND s.law_firm_id = public.get_user_law_firm_id(auth.uid())
    )
  );

-- Policies para agenda_pro_clients
CREATE POLICY "Users can view own company clients" ON public.agenda_pro_clients
  FOR SELECT USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));
  
CREATE POLICY "Users can manage own company clients" ON public.agenda_pro_clients
  FOR ALL USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- Policies para agenda_pro_appointments
CREATE POLICY "Users can view own company appointments" ON public.agenda_pro_appointments
  FOR SELECT USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));
  
CREATE POLICY "Users can manage own company appointments" ON public.agenda_pro_appointments
  FOR ALL USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- Policy para inserir agendamentos públicos (sem autenticação)
CREATE POLICY "Public can insert appointments" ON public.agenda_pro_appointments
  FOR INSERT WITH CHECK (
    source = 'public_booking' AND
    EXISTS (
      SELECT 1 FROM public.agenda_pro_settings s 
      WHERE s.law_firm_id = agenda_pro_appointments.law_firm_id 
      AND s.public_booking_enabled = true
    )
  );

-- Policies para agenda_pro_holidays
CREATE POLICY "Users can view holidays" ON public.agenda_pro_holidays
  FOR SELECT USING (
    law_firm_id IS NULL OR 
    law_firm_id = public.get_user_law_firm_id(auth.uid())
  );
  
CREATE POLICY "Users can manage own holidays" ON public.agenda_pro_holidays
  FOR ALL USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- Policy pública para feriados
CREATE POLICY "Public can view holidays" ON public.agenda_pro_holidays
  FOR SELECT USING (is_national = true OR law_firm_id IS NOT NULL);

-- Policies para agenda_pro_activity_log
CREATE POLICY "Users can view own company logs" ON public.agenda_pro_activity_log
  FOR SELECT USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));
  
CREATE POLICY "Users can insert logs" ON public.agenda_pro_activity_log
  FOR INSERT WITH CHECK (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- =============================================
-- TRIGGERS
-- =============================================

-- Trigger para atualizar updated_at
CREATE TRIGGER update_agenda_pro_settings_updated_at
  BEFORE UPDATE ON public.agenda_pro_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agenda_pro_professionals_updated_at
  BEFORE UPDATE ON public.agenda_pro_professionals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agenda_pro_resources_updated_at
  BEFORE UPDATE ON public.agenda_pro_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agenda_pro_services_updated_at
  BEFORE UPDATE ON public.agenda_pro_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agenda_pro_clients_updated_at
  BEFORE UPDATE ON public.agenda_pro_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agenda_pro_appointments_updated_at
  BEFORE UPDATE ON public.agenda_pro_appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_pro_appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_pro_professionals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_pro_services;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_pro_clients;

-- =============================================
-- FERIADOS NACIONAIS BRASILEIROS
-- =============================================
INSERT INTO public.agenda_pro_holidays (name, date, is_national, is_recurring) VALUES
  ('Confraternização Universal', '2025-01-01', true, true),
  ('Carnaval', '2025-03-03', true, false),
  ('Carnaval', '2025-03-04', true, false),
  ('Sexta-feira Santa', '2025-04-18', true, false),
  ('Tiradentes', '2025-04-21', true, true),
  ('Dia do Trabalho', '2025-05-01', true, true),
  ('Corpus Christi', '2025-06-19', true, false),
  ('Independência do Brasil', '2025-09-07', true, true),
  ('Nossa Senhora Aparecida', '2025-10-12', true, true),
  ('Finados', '2025-11-02', true, true),
  ('Proclamação da República', '2025-11-15', true, true),
  ('Natal', '2025-12-25', true, true);