-- Add columns to track company suspension for non-payment
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS suspended_at timestamp with time zone;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS suspended_by uuid;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS suspended_reason text;

-- Add comments for documentation
COMMENT ON COLUMN public.companies.suspended_at IS 'Data em que a empresa foi suspensa por inadimplência';
COMMENT ON COLUMN public.companies.suspended_by IS 'Admin que suspendeu a empresa';
COMMENT ON COLUMN public.companies.suspended_reason IS 'Motivo da suspensão (ex: Inadimplência desde 01/02/2026)';