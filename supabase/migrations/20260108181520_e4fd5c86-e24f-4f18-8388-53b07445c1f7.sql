
-- Tabela de Profissionais
CREATE TABLE public.professionals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  document TEXT,
  specialty TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_professionals_law_firm ON public.professionals(law_firm_id);
CREATE INDEX idx_professionals_active ON public.professionals(law_firm_id, is_active);

-- RLS
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view professionals from their law firm"
  ON public.professionals FOR SELECT
  USING (law_firm_id IN (SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage professionals from their law firm"
  ON public.professionals FOR ALL
  USING (law_firm_id IN (SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()));

-- Tabela de vínculo Profissional-Serviço
CREATE TABLE public.professional_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(professional_id, service_id)
);

CREATE INDEX idx_professional_services_professional ON public.professional_services(professional_id);
CREATE INDEX idx_professional_services_service ON public.professional_services(service_id);

ALTER TABLE public.professional_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view professional_services from their law firm"
  ON public.professional_services FOR SELECT
  USING (professional_id IN (SELECT id FROM public.professionals WHERE law_firm_id IN (SELECT law_firm_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Users can manage professional_services from their law firm"
  ON public.professional_services FOR ALL
  USING (professional_id IN (SELECT id FROM public.professionals WHERE law_firm_id IN (SELECT law_firm_id FROM public.profiles WHERE id = auth.uid())));

-- Adicionar profissional ao agendamento
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL;

CREATE INDEX idx_appointments_professional ON public.appointments(professional_id);

-- Adicionar campos extras nos clientes para aniversário
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS birthday_message_enabled BOOLEAN DEFAULT false;

-- Tabela de configurações de mensagens de aniversário
CREATE TABLE public.birthday_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT false,
  message_template TEXT DEFAULT 'Olá {nome}! 🎂 Feliz aniversário! Desejamos um dia muito especial para você. Como presente, oferecemos um desconto especial. Entre em contato conosco!',
  send_time TIME DEFAULT '09:00',
  include_coupon BOOLEAN DEFAULT false,
  coupon_discount_percent INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.birthday_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view birthday_settings from their law firm"
  ON public.birthday_settings FOR SELECT
  USING (law_firm_id IN (SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage birthday_settings from their law firm"
  ON public.birthday_settings FOR ALL
  USING (law_firm_id IN (SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_professionals_updated_at
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_birthday_settings_updated_at
  BEFORE UPDATE ON public.birthday_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
