-- Add assigned_to column to clients table to track the responsible attendant
ALTER TABLE public.clients 
ADD COLUMN assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_clients_assigned_to ON public.clients(assigned_to);

-- Add comment for documentation
COMMENT ON COLUMN public.clients.assigned_to IS 'ID of the attendant responsible for this client';