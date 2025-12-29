-- Add client_app_status and provisioning_status to companies table
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS client_app_status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS provisioning_status text NOT NULL DEFAULT 'pending';

-- Add comments for documentation
COMMENT ON COLUMN public.companies.client_app_status IS 'Status do provisionamento do Client App: pending, creating, created, error';
COMMENT ON COLUMN public.companies.provisioning_status IS 'Status geral do provisionamento: pending, partial, active, error';
COMMENT ON COLUMN public.companies.n8n_workflow_status IS 'Status do workflow n8n: pending, creating, created, error';