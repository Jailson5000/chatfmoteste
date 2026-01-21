-- Drop and recreate the view with new structure
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
  -- Plan info
  p.name AS plan_name,
  p.price AS plan_price,
  -- Plan limits (base)
  p.max_users AS plan_max_users,
  p.max_instances AS plan_max_instances,
  p.max_agents AS plan_max_agents,
  p.max_ai_conversations AS plan_max_ai_conversations,
  p.max_tts_minutes AS plan_max_tts_minutes,
  -- Effective limits (custom or plan defaults)
  COALESCE(NULLIF(c.max_users, 0), p.max_users, 0) AS effective_max_users,
  COALESCE(NULLIF(c.max_instances, 0), p.max_instances, 0) AS effective_max_instances,
  COALESCE(NULLIF(c.max_agents, 0), p.max_agents, 0) AS effective_max_agents,
  COALESCE(NULLIF(c.max_ai_conversations, 0), p.max_ai_conversations, 0) AS effective_max_ai_conversations,
  COALESCE(NULLIF(c.max_tts_minutes, 0), p.max_tts_minutes, 0) AS effective_max_tts_minutes,
  -- Current usage counts
  COALESCE(user_counts.cnt, 0) AS current_users,
  COALESCE(instance_counts.cnt, 0) AS current_instances,
  COALESCE(agent_counts.cnt, 0) AS current_agents,
  COALESCE(ai_usage.total_conversations, 0) AS current_ai_conversations,
  COALESCE(tts_usage.total_minutes, 0) AS current_tts_minutes
FROM companies c
LEFT JOIN plans p ON c.plan_id = p.id
LEFT JOIN (
  SELECT pr.law_firm_id, COUNT(*) AS cnt
  FROM profiles pr
  WHERE pr.is_active = true
  GROUP BY pr.law_firm_id
) user_counts ON c.law_firm_id = user_counts.law_firm_id
LEFT JOIN (
  SELECT wi.law_firm_id, COUNT(*) AS cnt
  FROM whatsapp_instances wi
  WHERE wi.status = 'connected'
  GROUP BY wi.law_firm_id
) instance_counts ON c.law_firm_id = instance_counts.law_firm_id
LEFT JOIN (
  SELECT a.law_firm_id, COUNT(*) AS cnt
  FROM automations a
  WHERE a.is_active = true
  GROUP BY a.law_firm_id
) agent_counts ON c.law_firm_id = agent_counts.law_firm_id
LEFT JOIN (
  SELECT ur.law_firm_id, SUM(ur.count) AS total_conversations
  FROM usage_records ur
  WHERE ur.usage_type = 'ai_conversation'
    AND ur.billing_period = to_char(CURRENT_DATE, 'YYYY-MM')
  GROUP BY ur.law_firm_id
) ai_usage ON c.law_firm_id = ai_usage.law_firm_id
LEFT JOIN (
  SELECT ur.law_firm_id, COALESCE(SUM(ur.duration_seconds) / 60.0, 0) AS total_minutes
  FROM usage_records ur
  WHERE ur.usage_type = 'tts_minute'
    AND ur.billing_period = to_char(CURRENT_DATE, 'YYYY-MM')
  GROUP BY ur.law_firm_id
) tts_usage ON c.law_firm_id = tts_usage.law_firm_id;