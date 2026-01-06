-- Table to store multiple Evolution API connections
CREATE TABLE public.evolution_api_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  last_health_check_at TIMESTAMP WITH TIME ZONE,
  health_status TEXT DEFAULT 'unknown',
  health_latency_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.evolution_api_connections ENABLE ROW LEVEL SECURITY;

-- Only admins can view and manage
CREATE POLICY "Admins can view evolution connections"
ON public.evolution_api_connections
FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Super admins can manage evolution connections"
ON public.evolution_api_connections
FOR ALL
USING (has_admin_role(auth.uid(), 'super_admin'::admin_role));

-- Update timestamp trigger
CREATE TRIGGER update_evolution_api_connections_updated_at
BEFORE UPDATE ON public.evolution_api_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Ensure only one default connection
CREATE OR REPLACE FUNCTION ensure_single_default_evolution_connection()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.evolution_api_connections
    SET is_default = false
    WHERE id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER ensure_single_default_evolution
BEFORE INSERT OR UPDATE ON public.evolution_api_connections
FOR EACH ROW
WHEN (NEW.is_default = true)
EXECUTE FUNCTION ensure_single_default_evolution_connection();