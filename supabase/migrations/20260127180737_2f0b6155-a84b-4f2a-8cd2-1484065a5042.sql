-- =============================================
-- REMOÇÃO COMPLETA DO TRAY COMMERCE
-- =============================================

-- 1. Dropar políticas RLS primeiro
DROP POLICY IF EXISTS "Admins can view tray connections" ON public.tray_commerce_connections;
DROP POLICY IF EXISTS "Admins can manage tray connections" ON public.tray_commerce_connections;
DROP POLICY IF EXISTS "Only service role can insert tray_commerce_audit_logs" ON public.tray_commerce_audit_logs;
DROP POLICY IF EXISTS "Only service role can insert tray_commerce_webhook_logs" ON public.tray_commerce_webhook_logs;

-- 2. Dropar tabelas em ordem (respeitando FKs)
DROP TABLE IF EXISTS public.tray_commerce_webhook_logs CASCADE;
DROP TABLE IF EXISTS public.tray_commerce_audit_logs CASCADE;
DROP TABLE IF EXISTS public.tray_commerce_sync_state CASCADE;
DROP TABLE IF EXISTS public.tray_coupon_map CASCADE;
DROP TABLE IF EXISTS public.tray_order_map CASCADE;
DROP TABLE IF EXISTS public.tray_product_map CASCADE;
DROP TABLE IF EXISTS public.tray_commerce_connections CASCADE;

-- 3. Dropar funções/triggers
DROP FUNCTION IF EXISTS public.create_tray_sync_state() CASCADE;
DROP FUNCTION IF EXISTS public.ensure_single_default_tray_connection() CASCADE;