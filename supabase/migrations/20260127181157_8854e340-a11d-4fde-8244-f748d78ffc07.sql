-- =============================================
-- CORREÇÃO DE VIEWS COM SECURITY DEFINER
-- =============================================

-- 1. Recriar whatsapp_instances_safe COM security_invoker e filtro de tenant
DROP VIEW IF EXISTS public.whatsapp_instances_safe;
CREATE VIEW public.whatsapp_instances_safe
WITH (security_invoker=on) AS
SELECT 
  id,
  law_firm_id,
  instance_name,
  instance_id,
  api_url,
  phone_number,
  status,
  created_at,
  updated_at,
  last_webhook_event,
  last_webhook_at,
  default_department_id,
  default_status_id,
  default_assigned_to,
  disconnected_since,
  last_alert_sent_at,
  display_name,
  default_automation_id,
  reconnect_attempts_count,
  last_reconnect_attempt_at,
  manual_disconnect,
  awaiting_qr,
  alert_sent_for_current_disconnect
FROM public.whatsapp_instances
WHERE law_firm_id = get_user_law_firm_id(auth.uid())
   OR is_admin(auth.uid());
-- Exclui: api_key, api_key_encrypted

-- 2. Recriar agenda_pro_professionals_public COM security_invoker e filtro de tenant
DROP VIEW IF EXISTS public.agenda_pro_professionals_public;
CREATE VIEW public.agenda_pro_professionals_public
WITH (security_invoker=on) AS
SELECT 
  id,
  law_firm_id,
  name,
  specialty,
  bio,
  avatar_url,
  color,
  is_active,
  position
FROM public.agenda_pro_professionals
WHERE law_firm_id = get_user_law_firm_id(auth.uid())
   OR is_admin(auth.uid());

-- 3. Recriar google_calendar_integrations_safe COM security_invoker
DROP VIEW IF EXISTS public.google_calendar_integrations_safe;
CREATE VIEW public.google_calendar_integrations_safe
WITH (security_invoker=on) AS
SELECT 
  id,
  law_firm_id,
  google_email,
  google_account_id,
  default_calendar_id,
  default_calendar_name,
  allow_read_events,
  allow_create_events,
  allow_edit_events,
  allow_delete_events,
  last_sync_at,
  next_sync_at,
  is_active,
  connected_by,
  connected_at,
  created_at,
  updated_at
FROM public.google_calendar_integrations
WHERE law_firm_id = get_user_law_firm_id(auth.uid())
   OR is_admin(auth.uid());
-- Exclui: access_token, refresh_token

-- 4. Recriar google_calendar_integration_status COM security_invoker
DROP VIEW IF EXISTS public.google_calendar_integration_status;
CREATE VIEW public.google_calendar_integration_status
WITH (security_invoker=on) AS
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
WHERE law_firm_id = get_user_law_firm_id(auth.uid())
   OR is_admin(auth.uid());

-- NOTA: company_usage_summary NÃO é alterada pois precisa acesso cross-tenant para Global Admin