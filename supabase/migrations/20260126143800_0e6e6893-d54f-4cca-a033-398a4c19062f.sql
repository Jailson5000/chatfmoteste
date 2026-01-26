-- Create a safe view for whatsapp_instances that hides the api_key
CREATE VIEW public.whatsapp_instances_safe AS
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
  -- api_key and api_key_encrypted are intentionally excluded for security
FROM public.whatsapp_instances;

-- Grant access to authenticated users
GRANT SELECT ON public.whatsapp_instances_safe TO authenticated;

-- Add comment documenting security
COMMENT ON VIEW public.whatsapp_instances_safe IS 
'Safe view for whatsapp_instances that excludes api_key fields. 
Frontend should always use this view instead of the base table.
Edge functions can still access the base table via service_role.';