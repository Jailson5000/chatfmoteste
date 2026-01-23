
-- ============================================
-- FIX 1: google_calendar_integrations_safe view
-- VULNERABILITY: No tenant filter - exposes all companies' data
-- FIX: Add SECURITY INVOKER and tenant filter
-- ============================================

DROP VIEW IF EXISTS public.google_calendar_integrations_safe;

CREATE VIEW public.google_calendar_integrations_safe
WITH (security_invoker = true)
AS
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
FROM google_calendar_integrations
WHERE law_firm_id = get_user_law_firm_id(auth.uid())
   OR is_admin(auth.uid());

COMMENT ON VIEW public.google_calendar_integrations_safe IS 'Safe view that excludes tokens. Uses SECURITY INVOKER to respect RLS and filters by tenant.';

-- ============================================
-- FIX 2: google_calendar_integration_status view
-- VULNERABILITY: Has tenant filter but no SECURITY INVOKER
-- FIX: Add SECURITY INVOKER
-- ============================================

DROP VIEW IF EXISTS public.google_calendar_integration_status;

CREATE VIEW public.google_calendar_integration_status
WITH (security_invoker = true)
AS
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
FROM google_calendar_integrations
WHERE law_firm_id = get_user_law_firm_id(auth.uid())
   OR is_admin(auth.uid());

COMMENT ON VIEW public.google_calendar_integration_status IS 'Integration status view with tenant isolation via SECURITY INVOKER.';

-- ============================================
-- FIX 3: company_usage_summary view
-- VULNERABILITY: No tenant filter - global admins only should see this
-- FIX: Add SECURITY INVOKER and tenant filter
-- ============================================

DROP VIEW IF EXISTS public.company_usage_summary;

CREATE VIEW public.company_usage_summary
WITH (security_invoker = true)
AS
SELECT 
    c.id AS company_id,
    c.name AS company_name,
    c.law_firm_id,
    c.plan_id,
    c.status,
    c.approval_status,
    c.use_custom_limits,
    c.allow_ai_overage,
    c.allow_tts_overage,
    p.name AS plan_name,
    p.price AS plan_price,
    p.max_users AS plan_max_users,
    p.max_instances AS plan_max_instances,
    p.max_agents AS plan_max_agents,
    p.max_ai_conversations AS plan_max_ai_conversations,
    p.max_tts_minutes AS plan_max_tts_minutes,
    COALESCE(NULLIF(c.max_users, 0), p.max_users, 0) AS effective_max_users,
    COALESCE(NULLIF(c.max_instances, 0), p.max_instances, 0) AS effective_max_instances,
    COALESCE(NULLIF(c.max_agents, 0), p.max_agents, 0) AS effective_max_agents,
    COALESCE(NULLIF(c.max_ai_conversations, 0), p.max_ai_conversations, 0) AS effective_max_ai_conversations,
    COALESCE(NULLIF(c.max_tts_minutes, 0), p.max_tts_minutes, 0) AS effective_max_tts_minutes,
    COALESCE(user_counts.cnt, 0::bigint) AS current_users,
    COALESCE(instance_counts.cnt, 0::bigint) AS current_instances,
    COALESCE(agent_counts.cnt, 0::bigint) AS current_agents,
    COALESCE(ai_usage.total_conversations, 0::bigint) AS current_ai_conversations,
    COALESCE(tts_usage.total_minutes, 0::numeric) AS current_tts_minutes
FROM companies c
LEFT JOIN plans p ON c.plan_id = p.id
LEFT JOIN (
    SELECT pr.law_firm_id, count(*) AS cnt
    FROM profiles pr
    WHERE pr.is_active = true
    GROUP BY pr.law_firm_id
) user_counts ON c.law_firm_id = user_counts.law_firm_id
LEFT JOIN (
    SELECT wi.law_firm_id, count(*) AS cnt
    FROM whatsapp_instances wi
    WHERE wi.status = 'connected'::text
    GROUP BY wi.law_firm_id
) instance_counts ON c.law_firm_id = instance_counts.law_firm_id
LEFT JOIN (
    SELECT a.law_firm_id, count(*) AS cnt
    FROM automations a
    WHERE a.is_active = true
    GROUP BY a.law_firm_id
) agent_counts ON c.law_firm_id = agent_counts.law_firm_id
LEFT JOIN (
    SELECT ur.law_firm_id, sum(ur.count) AS total_conversations
    FROM usage_records ur
    WHERE ur.usage_type = 'ai_conversation'::text 
      AND ur.billing_period = to_char(CURRENT_DATE::timestamp with time zone, 'YYYY-MM'::text)
    GROUP BY ur.law_firm_id
) ai_usage ON c.law_firm_id = ai_usage.law_firm_id
LEFT JOIN (
    SELECT ur.law_firm_id, COALESCE((sum(ur.duration_seconds)::numeric / 60.0), 0::numeric) AS total_minutes
    FROM usage_records ur
    WHERE ur.usage_type = 'tts_minute'::text 
      AND ur.billing_period = to_char(CURRENT_DATE::timestamp with time zone, 'YYYY-MM'::text)
    GROUP BY ur.law_firm_id
) tts_usage ON c.law_firm_id = tts_usage.law_firm_id
WHERE 
    -- Global admins can see all companies
    is_admin(auth.uid())
    -- Regular users can only see their own company
    OR c.law_firm_id = get_user_law_firm_id(auth.uid());

COMMENT ON VIEW public.company_usage_summary IS 'Company usage summary with tenant isolation. Global admins see all, regular users see only their company.';
