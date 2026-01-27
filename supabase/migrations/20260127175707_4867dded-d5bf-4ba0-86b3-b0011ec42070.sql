-- Adicionar coluna para rastrear última leitura do cliente
ALTER TABLE public.support_tickets 
ADD COLUMN client_last_read_at timestamptz DEFAULT now();