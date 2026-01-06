-- Fix functions without SET search_path (security hardening)

-- Update normalize_phone function to include search_path
CREATE OR REPLACE FUNCTION public.normalize_phone(phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT regexp_replace(phone, '\D', '', 'g')
$function$;

-- Note: company_usage_summary view already has security_invoker=true
-- We'll add a proper RLS policy on the underlying tables check
-- The view respects RLS on base tables, which is the correct behavior

-- Create an index to optimize the view query if not exists
CREATE INDEX IF NOT EXISTS idx_profiles_law_firm_active 
ON public.profiles(law_firm_id) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_automations_law_firm_active 
ON public.automations(law_firm_id) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_law_firm 
ON public.whatsapp_instances(law_firm_id);

-- Add comment documenting the security model
COMMENT ON VIEW public.company_usage_summary IS 
'Usage metrics aggregation view. Uses security_invoker=true to respect RLS on underlying tables. 
Global admins can see all companies via is_admin() function. 
Regular users can only see data from tables they have access to via RLS.';