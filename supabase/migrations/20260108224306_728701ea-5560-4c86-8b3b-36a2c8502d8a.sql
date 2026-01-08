-- ============================================================================
-- FASE 2: RLS CLEANUP - Remover policies permissivas antigas
-- IMPORTANTE: Executar apenas após validação da Fase 1
-- ============================================================================

-- 1. admin_notification_logs
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.admin_notification_logs;

-- 2. ai_processing_queue
DROP POLICY IF EXISTS "Service role full access to ai_processing_queue" ON public.ai_processing_queue;

-- 3. ai_transfer_logs
DROP POLICY IF EXISTS "System can insert transfer logs" ON public.ai_transfer_logs;

-- 4. audit_logs
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

-- 5. google_calendar_ai_logs
DROP POLICY IF EXISTS "System can insert logs" ON public.google_calendar_ai_logs;

-- 6. instance_status_history
DROP POLICY IF EXISTS "System can insert status history" ON public.instance_status_history;

-- 7. system_metrics
DROP POLICY IF EXISTS "System can insert metrics" ON public.system_metrics;

-- 8. tray_chat_audit_logs
DROP POLICY IF EXISTS "System can insert audit logs" ON public.tray_chat_audit_logs;

-- 9. tray_commerce_audit_logs
DROP POLICY IF EXISTS "System can insert audit logs" ON public.tray_commerce_audit_logs;

-- 10. tray_commerce_webhook_logs
DROP POLICY IF EXISTS "System can insert webhook logs" ON public.tray_commerce_webhook_logs;

-- 11. usage_history_monthly
DROP POLICY IF EXISTS "System can manage usage history" ON public.usage_history_monthly;

-- ============================================================================
-- VALIDAÇÃO: Todas as tabelas de log/sistema agora estão restritas a service_role
-- ============================================================================