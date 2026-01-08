-- Add column to distinguish agenda clients from regular contacts
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS is_agenda_client boolean DEFAULT false;

-- Create index for filtering agenda clients
CREATE INDEX IF NOT EXISTS idx_clients_is_agenda_client 
ON public.clients(law_firm_id, is_agenda_client) 
WHERE is_agenda_client = true;