-- =====================================================
-- CORREÇÕES DE SEGURANÇA MULTI-TENANT - PRODUÇÃO
-- =====================================================

-- 1. CORRIGIR RLS: conversations - REMOVER acesso público
DROP POLICY IF EXISTS "Allow conversations read for users and triggers" ON public.conversations;
CREATE POLICY "Users can view conversations in their law firm"
  ON public.conversations FOR SELECT
  USING (
    (auth.uid() IS NOT NULL AND law_firm_id = get_user_law_firm_id(auth.uid()))
    OR is_admin(auth.uid())
  );

-- 2. CORRIGIR RLS: scheduled_follow_ups - REMOVER acesso público de todas as políticas
DROP POLICY IF EXISTS "scheduled_follow_ups_select" ON public.scheduled_follow_ups;
DROP POLICY IF EXISTS "scheduled_follow_ups_insert" ON public.scheduled_follow_ups;
DROP POLICY IF EXISTS "scheduled_follow_ups_update" ON public.scheduled_follow_ups;
DROP POLICY IF EXISTS "scheduled_follow_ups_delete" ON public.scheduled_follow_ups;

CREATE POLICY "scheduled_follow_ups_select"
  ON public.scheduled_follow_ups FOR SELECT
  USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "scheduled_follow_ups_insert"
  ON public.scheduled_follow_ups FOR INSERT
  WITH CHECK (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "scheduled_follow_ups_update"
  ON public.scheduled_follow_ups FOR UPDATE
  USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "scheduled_follow_ups_delete"
  ON public.scheduled_follow_ups FOR DELETE
  USING (law_firm_id = get_user_law_firm_id(auth.uid()));

-- 3. CORRIGIR RLS: status_follow_ups - REMOVER acesso público
DROP POLICY IF EXISTS "Allow follow-ups read for users and triggers" ON public.status_follow_ups;
CREATE POLICY "Users can view status follow-ups in their law firm"
  ON public.status_follow_ups FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND law_firm_id = get_user_law_firm_id(auth.uid())
  );

-- 4. CORRIGIR RLS: plans - restringir apenas para usuários autenticados
DROP POLICY IF EXISTS "Anyone can view active plans" ON public.plans;
CREATE POLICY "Authenticated users can view active plans"
  ON public.plans FOR SELECT
  USING (
    (auth.uid() IS NOT NULL AND is_active = true)
    OR is_admin(auth.uid())
  );

-- 5. Remover função de teste que foi criada para debug
DROP FUNCTION IF EXISTS public.test_schedule_follow_ups(uuid, uuid);

-- 6. Criar view company_usage_summary como INVOKER (não DEFINER) para respeitar RLS
DROP VIEW IF EXISTS public.company_usage_summary;
CREATE VIEW public.company_usage_summary
WITH (security_invoker = true)
AS
SELECT 
    c.id AS company_id,
    c.law_firm_id,
    c.name AS company_name,
    c.plan_id,
    p.name AS plan_name,
    c.use_custom_limits,
    CASE
        WHEN (c.use_custom_limits AND (c.max_users IS NOT NULL)) THEN c.max_users
        ELSE COALESCE(p.max_users, 5)
    END AS effective_max_users,
    CASE
        WHEN (c.use_custom_limits AND (c.max_instances IS NOT NULL)) THEN c.max_instances
        ELSE COALESCE(p.max_instances, 2)
    END AS effective_max_instances,
    CASE
        WHEN (c.use_custom_limits AND (c.max_agents IS NOT NULL)) THEN c.max_agents
        ELSE COALESCE(p.max_agents, 1)
    END AS effective_max_agents,
    CASE
        WHEN (c.use_custom_limits AND (c.max_workspaces IS NOT NULL)) THEN c.max_workspaces
        ELSE COALESCE(p.max_workspaces, 1)
    END AS effective_max_workspaces,
    CASE
        WHEN (c.use_custom_limits AND (c.max_ai_conversations IS NOT NULL)) THEN c.max_ai_conversations
        ELSE COALESCE(p.max_ai_conversations, 250)
    END AS effective_max_ai_conversations,
    CASE
        WHEN (c.use_custom_limits AND (c.max_tts_minutes IS NOT NULL)) THEN c.max_tts_minutes
        ELSE COALESCE(p.max_tts_minutes, 40)
    END AS effective_max_tts_minutes,
    (SELECT count(*) FROM profiles pr WHERE pr.law_firm_id = c.law_firm_id) AS current_users,
    (SELECT count(*) FROM whatsapp_instances wi WHERE wi.law_firm_id = c.law_firm_id) AS current_instances,
    (SELECT count(*) FROM automations a WHERE a.law_firm_id = c.law_firm_id) AS current_agents,
    (SELECT COALESCE(NULLIF(
        (SELECT COALESCE(sum(ur.count), 0) FROM usage_records ur 
         WHERE ur.law_firm_id = c.law_firm_id 
         AND ur.usage_type = 'ai_conversation' 
         AND ur.billing_period = to_char(now(), 'YYYY-MM')), 0),
        (SELECT count(DISTINCT conv.id) FROM conversations conv
         JOIN messages m ON m.conversation_id = conv.id
         WHERE conv.law_firm_id = c.law_firm_id 
         AND m.ai_generated = true 
         AND m.created_at >= date_trunc('month', CURRENT_DATE)))) AS current_ai_conversations,
    (SELECT COALESCE(round((sum(ur.duration_seconds) / 60.0), 2), 0)
     FROM usage_records ur
     WHERE ur.law_firm_id = c.law_firm_id 
     AND ur.usage_type = 'tts_audio' 
     AND ur.billing_period = to_char(now(), 'YYYY-MM')) AS current_tts_minutes
FROM companies c
LEFT JOIN plans p ON c.plan_id = p.id
WHERE c.law_firm_id IS NOT NULL;