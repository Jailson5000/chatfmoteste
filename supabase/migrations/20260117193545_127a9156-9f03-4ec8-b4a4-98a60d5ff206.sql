-- Fix: Change view to use SECURITY INVOKER (default behavior) instead of SECURITY DEFINER
-- This ensures RLS policies are enforced based on the querying user
DROP VIEW IF EXISTS public.google_calendar_integration_status;

-- Recreate view with explicit SECURITY INVOKER
CREATE VIEW public.google_calendar_integration_status 
WITH (security_invoker = true) AS
SELECT 
  id, 
  law_firm_id, 
  google_email, 
  is_active,
  allow_read_events, 
  allow_create_events,
  allow_edit_events, 
  allow_delete_events,
  last_sync_at, 
  connected_at,
  default_calendar_id,
  default_calendar_name
FROM public.google_calendar_integrations
WHERE law_firm_id = public.get_user_law_firm_id(auth.uid());

-- Grant access to the secure view
GRANT SELECT ON public.google_calendar_integration_status TO authenticated;