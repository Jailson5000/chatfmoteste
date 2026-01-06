-- Add subdomain column to law_firms table for multi-tenant support
ALTER TABLE public.law_firms 
ADD COLUMN IF NOT EXISTS subdomain TEXT UNIQUE;

-- Create index for fast subdomain lookups
CREATE INDEX IF NOT EXISTS idx_law_firms_subdomain ON public.law_firms(subdomain);

-- Add constraint to ensure subdomain follows valid format (lowercase, alphanumeric, hyphens)
ALTER TABLE public.law_firms 
ADD CONSTRAINT valid_subdomain_format 
CHECK (subdomain IS NULL OR subdomain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');

-- Create function to get law firm by subdomain
CREATE OR REPLACE FUNCTION public.get_law_firm_by_subdomain(_subdomain text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id
    FROM public.law_firms
    WHERE subdomain = _subdomain
$$;

-- Create RLS policy for public subdomain lookup (needed for login page)
CREATE POLICY "Allow public subdomain lookup"
ON public.law_firms
FOR SELECT
USING (true);

-- Note: This policy allows reading law_firms for subdomain resolution
-- Sensitive data should be protected by column-level security or separate tables