-- Permitir NULL em professional_id para suportar exclusão com histórico
-- Isso permite que agendamentos sejam mantidos mesmo após excluir o profissional
ALTER TABLE public.agenda_pro_appointments 
ALTER COLUMN professional_id DROP NOT NULL;