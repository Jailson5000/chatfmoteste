-- Fix 1: Remove redundant public policies from system_settings
-- Keep only one minimal policy for payment provider (needed for public checkout modal)
DROP POLICY IF EXISTS "Public can read payment provider" ON public.system_settings;

-- The "Allow public read for payment and registration settings" already covers payment_provider
-- So we just need to clean up the duplicate


-- Fix 2: Recreate company_usage_summary view with security_invoker = true
-- This ensures RLS is inherited from underlying tables
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
        WHEN c.use_custom_limits AND c.max_users IS NOT NULL THEN c.max_users
        ELSE COALESCE(p.max_users, 5)
    END AS effective_max_users,
    CASE
        WHEN c.use_custom_limits AND c.max_instances IS NOT NULL THEN c.max_instances
        ELSE COALESCE(p.max_instances, 2)
    END AS effective_max_instances,
    CASE
        WHEN c.use_custom_limits AND c.max_agents IS NOT NULL THEN c.max_agents
        ELSE COALESCE(p.max_agents, 1)
    END AS effective_max_agents,
    CASE
        WHEN c.use_custom_limits AND c.max_workspaces IS NOT NULL THEN c.max_workspaces
        ELSE COALESCE(p.max_workspaces, 1)
    END AS effective_max_workspaces,
    CASE
        WHEN c.use_custom_limits AND c.max_ai_conversations IS NOT NULL THEN c.max_ai_conversations
        ELSE COALESCE(p.max_ai_conversations, 250)
    END AS effective_max_ai_conversations,
    CASE
        WHEN c.use_custom_limits AND c.max_tts_minutes IS NOT NULL THEN c.max_tts_minutes
        ELSE COALESCE(p.max_tts_minutes, 40)
    END AS effective_max_tts_minutes,
    (SELECT count(*) FROM profiles pr WHERE pr.law_firm_id = c.law_firm_id) AS current_users,
    (SELECT count(*) FROM whatsapp_instances wi WHERE wi.law_firm_id = c.law_firm_id) AS current_instances,
    (SELECT count(*) FROM automations a WHERE a.law_firm_id = c.law_firm_id) AS current_agents,
    (
        SELECT COALESCE(
            NULLIF(
                (SELECT COALESCE(sum(ur.count), 0::bigint)
                 FROM usage_records ur
                 WHERE ur.law_firm_id = c.law_firm_id 
                   AND ur.usage_type = 'ai_conversation'
                   AND ur.billing_period = to_char(now(), 'YYYY-MM')),
                0
            ),
            (SELECT count(DISTINCT conv.id)
             FROM conversations conv
             JOIN messages m ON m.conversation_id = conv.id
             WHERE conv.law_firm_id = c.law_firm_id 
               AND m.ai_generated = true 
               AND m.created_at >= date_trunc('month', CURRENT_DATE::timestamp with time zone))
        )
    ) AS current_ai_conversations,
    (
        SELECT COALESCE(round(sum(ur.duration_seconds)::numeric / 60.0, 2), 0::numeric)
        FROM usage_records ur
        WHERE ur.law_firm_id = c.law_firm_id 
          AND ur.usage_type = 'tts_audio'
          AND ur.billing_period = to_char(now(), 'YYYY-MM')
    ) AS current_tts_minutes
FROM companies c
LEFT JOIN plans p ON c.plan_id = p.id
WHERE c.law_firm_id IS NOT NULL;

-- Add comment explaining the view
COMMENT ON VIEW public.company_usage_summary IS 'Aggregates company usage data with plan limits. Uses security_invoker to inherit RLS from underlying tables.';