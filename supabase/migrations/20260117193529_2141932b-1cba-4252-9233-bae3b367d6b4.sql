-- Fix: Restrict Google Calendar OAuth tokens to admin-only access
-- Drop existing permissive policy
DROP POLICY IF EXISTS "Users can view their law firm integration" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can update their law firm integration" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can delete their law firm integration" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can insert their law firm integration" ON public.google_calendar_integrations;

-- Create admin-only policies for full token access
CREATE POLICY "Admins can view integration with tokens"
  ON public.google_calendar_integrations FOR SELECT
  USING (
    law_firm_id = public.get_user_law_firm_id(auth.uid()) 
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins can update integration"
  ON public.google_calendar_integrations FOR UPDATE
  USING (
    law_firm_id = public.get_user_law_firm_id(auth.uid()) 
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins can delete integration"
  ON public.google_calendar_integrations FOR DELETE
  USING (
    law_firm_id = public.get_user_law_firm_id(auth.uid()) 
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins can insert integration"
  ON public.google_calendar_integrations FOR INSERT
  WITH CHECK (
    law_firm_id = public.get_user_law_firm_id(auth.uid()) 
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Create a secure view for non-admin users (status only, no tokens)
CREATE OR REPLACE VIEW public.google_calendar_integration_status AS
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
  -- EXCLUDE: access_token, refresh_token, token_expires_at
FROM public.google_calendar_integrations;

-- Grant access to the secure view
GRANT SELECT ON public.google_calendar_integration_status TO authenticated;

-- Fix: Also restrict Tray Commerce OAuth tokens (same vulnerability pattern)
DROP POLICY IF EXISTS "Users can view their law firm connections" ON public.tray_commerce_connections;
DROP POLICY IF EXISTS "Users can manage their law firm connections" ON public.tray_commerce_connections;

CREATE POLICY "Admins can view tray connections"
  ON public.tray_commerce_connections FOR SELECT
  USING (
    law_firm_id = public.get_user_law_firm_id(auth.uid()) 
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins can manage tray connections"
  ON public.tray_commerce_connections FOR ALL
  USING (
    law_firm_id = public.get_user_law_firm_id(auth.uid()) 
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );