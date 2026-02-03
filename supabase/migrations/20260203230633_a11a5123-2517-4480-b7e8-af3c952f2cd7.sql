
-- Recreate company_usage_summary view with security_invoker enabled
-- This ensures RLS is respected while still allowing global admins to see all data

DROP VIEW IF EXISTS public.company_usage_summary;

CREATE VIEW public.company_usage_summary
WITH (security_invoker = on)
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
    (SELECT count(*) FROM profiles pr WHERE pr.law_firm_id = c.law_firm_id) AS current_users,
    (SELECT count(*) FROM whatsapp_instances wi WHERE wi.law_firm_id = c.law_firm_id) AS current_instances,
    (SELECT count(*) FROM automations a WHERE a.law_firm_id = c.law_firm_id AND a.is_active = true) AS current_agents,
    COALESCE(
        (SELECT sum(ur.count) FROM usage_records ur 
         WHERE ur.law_firm_id = c.law_firm_id 
         AND ur.usage_type = 'ai_conversation' 
         AND ur.billing_period = to_char(CURRENT_DATE::timestamp with time zone, 'YYYY-MM')), 
        0
    )::bigint AS current_ai_conversations,
    COALESCE(
        (SELECT (sum(ur.duration_seconds)::numeric / 60.0) FROM usage_records ur 
         WHERE ur.law_firm_id = c.law_firm_id 
         AND ur.usage_type = 'tts_audio' 
         AND ur.billing_period = to_char(CURRENT_DATE::timestamp with time zone, 'YYYY-MM')), 
        0
    )::numeric AS current_tts_minutes
FROM companies c
LEFT JOIN plans p ON c.plan_id = p.id
WHERE 
    -- Filter: user sees own company OR admin sees all
    c.law_firm_id = public.get_user_law_firm_id(auth.uid())
    OR public.is_admin(auth.uid());

-- Grant select to authenticated users (RLS + filter will control access)
GRANT SELECT ON public.company_usage_summary TO authenticated;

COMMENT ON VIEW public.company_usage_summary IS 'Aggregated company usage metrics. Uses security_invoker=on with explicit tenant filtering for security.';
