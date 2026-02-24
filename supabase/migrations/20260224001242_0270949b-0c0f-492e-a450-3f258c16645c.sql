
-- Fase 1: Adicionar coluna api_provider na tabela whatsapp_instances
ALTER TABLE public.whatsapp_instances 
ADD COLUMN api_provider text NOT NULL DEFAULT 'evolution'
CHECK (api_provider IN ('evolution', 'uazapi'));

-- Atualizar a view segura para incluir api_provider
CREATE OR REPLACE VIEW public.whatsapp_instances_safe AS
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
    alert_sent_for_current_disconnect,
    api_provider
FROM whatsapp_instances
WHERE law_firm_id = get_user_law_firm_id(auth.uid()) OR is_admin(auth.uid());
