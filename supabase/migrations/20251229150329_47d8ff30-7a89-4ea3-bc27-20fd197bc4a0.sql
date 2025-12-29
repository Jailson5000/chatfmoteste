-- Add retry tracking fields to companies table
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS n8n_retry_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS n8n_next_retry_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_health_check_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS health_status text DEFAULT 'unknown';

-- Add comments for documentation
COMMENT ON COLUMN public.companies.n8n_retry_count IS 'Number of retry attempts for n8n workflow creation';
COMMENT ON COLUMN public.companies.n8n_next_retry_at IS 'Next scheduled retry time with exponential backoff';
COMMENT ON COLUMN public.companies.last_health_check_at IS 'Last health check timestamp';
COMMENT ON COLUMN public.companies.health_status IS 'Health status: healthy, degraded, unhealthy, unknown';

-- Create index for efficient retry queries
CREATE INDEX IF NOT EXISTS idx_companies_n8n_next_retry ON public.companies(n8n_next_retry_at) 
WHERE n8n_workflow_status IN ('error', 'failed') AND n8n_next_retry_at IS NOT NULL;