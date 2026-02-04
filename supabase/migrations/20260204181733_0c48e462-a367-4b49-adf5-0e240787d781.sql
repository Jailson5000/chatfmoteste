-- Adicionar status de agendamento no onboarding
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS onboarding_meeting_status text DEFAULT NULL
CHECK (onboarding_meeting_status IN ('scheduled', 'declined'));

COMMENT ON COLUMN public.companies.onboarding_meeting_status IS 
'Status do agendamento de reunião no onboarding: scheduled (agendou), declined (não quer), NULL (pendente)';