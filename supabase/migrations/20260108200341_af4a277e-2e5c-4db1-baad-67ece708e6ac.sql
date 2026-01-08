-- Add timezone column to law_firms with São Paulo as default
ALTER TABLE public.law_firms 
ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Sao_Paulo';

-- Add comment for documentation
COMMENT ON COLUMN public.law_firms.timezone IS 'IANA timezone identifier (default: America/Sao_Paulo)';