-- Add n8n workflow tracking columns to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS n8n_workflow_id TEXT,
ADD COLUMN IF NOT EXISTS n8n_workflow_name TEXT,
ADD COLUMN IF NOT EXISTS n8n_workflow_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS n8n_last_error TEXT,
ADD COLUMN IF NOT EXISTS n8n_created_at TIMESTAMP WITH TIME ZONE;

-- Add index for workflow status queries
CREATE INDEX IF NOT EXISTS idx_companies_n8n_workflow_status ON public.companies(n8n_workflow_status);

-- Add comment for documentation
COMMENT ON COLUMN public.companies.n8n_workflow_id IS 'ID do workflow criado no n8n para esta empresa';
COMMENT ON COLUMN public.companies.n8n_workflow_name IS 'Nome do workflow no n8n';
COMMENT ON COLUMN public.companies.n8n_workflow_status IS 'Status do workflow: pending, created, failed';
COMMENT ON COLUMN public.companies.n8n_last_error IS 'Último erro ao criar/atualizar workflow';
COMMENT ON COLUMN public.companies.n8n_created_at IS 'Data de criação do workflow no n8n';