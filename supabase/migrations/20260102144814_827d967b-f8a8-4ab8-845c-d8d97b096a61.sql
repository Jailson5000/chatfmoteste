-- Update company_usage_summary to properly count AI conversations from usage_records
-- The usage_records now stores 1 record per conversation when AI assumes it

DROP VIEW IF EXISTS public.company_usage_summary;

CREATE OR REPLACE VIEW public.company_usage_summary AS
SELECT 
  c.id AS company_id,
  c.law_firm_id,
  c.name AS company_name,
  c.plan_id,
  p.name AS plan_name,
  c.use_custom_limits,
  -- Effective limits (custom or plan defaults)
  CASE WHEN c.use_custom_limits AND c.max_users IS NOT NULL THEN c.max_users ELSE COALESCE(p.max_users, 5) END AS effective_max_users,
  CASE WHEN c.use_custom_limits AND c.max_instances IS NOT NULL THEN c.max_instances ELSE COALESCE(p.max_instances, 2) END AS effective_max_instances,
  CASE WHEN c.use_custom_limits AND c.max_agents IS NOT NULL THEN c.max_agents ELSE COALESCE(p.max_agents, 1) END AS effective_max_agents,
  CASE WHEN c.use_custom_limits AND c.max_workspaces IS NOT NULL THEN c.max_workspaces ELSE COALESCE(p.max_workspaces, 1) END AS effective_max_workspaces,
  CASE WHEN c.use_custom_limits AND c.max_ai_conversations IS NOT NULL THEN c.max_ai_conversations ELSE COALESCE(p.max_ai_conversations, 250) END AS effective_max_ai_conversations,
  CASE WHEN c.use_custom_limits AND c.max_tts_minutes IS NOT NULL THEN c.max_tts_minutes ELSE COALESCE(p.max_tts_minutes, 40) END AS effective_max_tts_minutes,
  -- Current usage counts
  (SELECT COUNT(*) FROM profiles pr WHERE pr.law_firm_id = c.law_firm_id) AS current_users,
  (SELECT COUNT(*) FROM whatsapp_instances wi WHERE wi.law_firm_id = c.law_firm_id) AS current_instances,
  (SELECT COUNT(*) FROM automations a WHERE a.law_firm_id = c.law_firm_id) AS current_agents,
  -- AI Conversations: Count from usage_records (1 per conversation assumed by AI per month)
  -- Primary source: usage_records with type 'ai_conversation'
  -- Fallback: count distinct conversations with AI-generated messages this month
  (
    SELECT COALESCE(
      NULLIF(
        (SELECT COALESCE(SUM(ur.count), 0)::bigint 
         FROM usage_records ur 
         WHERE ur.law_firm_id = c.law_firm_id 
         AND ur.usage_type = 'ai_conversation' 
         AND ur.billing_period = to_char(now(), 'YYYY-MM')),
        0
      ),
      -- Fallback for historical data: count distinct conversations with AI messages
      (SELECT COUNT(DISTINCT conv.id) 
       FROM conversations conv
       JOIN messages m ON m.conversation_id = conv.id
       WHERE conv.law_firm_id = c.law_firm_id 
       AND m.ai_generated = true
       AND m.created_at >= date_trunc('month', CURRENT_DATE))
    )
  ) AS current_ai_conversations,
  -- TTS Minutes from usage_records
  (
    SELECT COALESCE(ROUND(SUM(ur.duration_seconds)::numeric / 60.0, 2), 0)
    FROM usage_records ur
    WHERE ur.law_firm_id = c.law_firm_id 
    AND ur.usage_type = 'tts_audio'
    AND ur.billing_period = to_char(now(), 'YYYY-MM')
  ) AS current_tts_minutes
FROM companies c
LEFT JOIN plans p ON c.plan_id = p.id
WHERE c.law_firm_id IS NOT NULL;

-- Grant access to authenticated users
GRANT SELECT ON public.company_usage_summary TO authenticated;

COMMENT ON VIEW public.company_usage_summary IS 'Consolidated view of company usage metrics vs plan limits. AI conversations counted as 1 per conversation assumed by AI (not per message).';