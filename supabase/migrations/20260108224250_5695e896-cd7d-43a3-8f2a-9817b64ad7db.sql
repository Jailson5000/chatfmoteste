-- ============================================================================
-- FASE 1: RLS HARDENING - Adicionar policies restritivas (SEM REMOVER EXISTENTES)
-- Objetivo: Tornar as permissões INSERT em tabelas de log/sistema explícitas
-- Mantendo as policies antigas para rollback se necessário
-- ============================================================================

-- 1. admin_notification_logs - Tabela de logs de notificação
-- Apenas service_role deve inserir (usado por Edge Functions)
CREATE POLICY "Only service role can insert admin_notification_logs" 
ON public.admin_notification_logs 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- 2. ai_processing_queue - Fila de processamento de IA
-- Apenas service_role para todas operações (gerenciado por Edge Functions)
CREATE POLICY "Only service role can access ai_processing_queue" 
ON public.ai_processing_queue 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);

-- 3. ai_transfer_logs - Logs de transferência de IA
CREATE POLICY "Only service role can insert ai_transfer_logs" 
ON public.ai_transfer_logs 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- 4. audit_logs - Logs de auditoria (crítico)
CREATE POLICY "Only service role can insert audit_logs" 
ON public.audit_logs 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- 5. google_calendar_ai_logs - Logs do Google Calendar
CREATE POLICY "Only service role can insert google_calendar_ai_logs" 
ON public.google_calendar_ai_logs 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- 6. instance_status_history - Histórico de status de instâncias
CREATE POLICY "Only service role can insert instance_status_history" 
ON public.instance_status_history 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- 7. system_metrics - Métricas do sistema
CREATE POLICY "Only service role can insert system_metrics" 
ON public.system_metrics 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- 8. tray_chat_audit_logs - Logs do Tray Chat
CREATE POLICY "Only service role can insert tray_chat_audit_logs" 
ON public.tray_chat_audit_logs 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- 9. tray_commerce_audit_logs - Logs do Tray Commerce
CREATE POLICY "Only service role can insert tray_commerce_audit_logs" 
ON public.tray_commerce_audit_logs 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- 10. tray_commerce_webhook_logs - Logs de webhook do Tray
CREATE POLICY "Only service role can insert tray_commerce_webhook_logs" 
ON public.tray_commerce_webhook_logs 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- 11. usage_history_monthly - Histórico de uso mensal
CREATE POLICY "Only service role can manage usage_history_monthly" 
ON public.usage_history_monthly 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- COMENTÁRIO: As policies antigas com WITH CHECK (true) para 'public' role 
-- NÃO foram removidas nesta fase. Serão removidas na Fase 2 após validação.
-- ============================================================================