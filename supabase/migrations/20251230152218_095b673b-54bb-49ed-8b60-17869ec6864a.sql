-- Add AI settings fields to law_firm_settings table
ALTER TABLE public.law_firm_settings
ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'internal',
ADD COLUMN IF NOT EXISTS openai_api_key TEXT,
ADD COLUMN IF NOT EXISTS ai_capabilities JSONB DEFAULT '{"auto_reply": true, "summary": true, "transcription": true, "classification": true}'::jsonb;

-- Add constraint for ai_provider values
ALTER TABLE public.law_firm_settings
ADD CONSTRAINT law_firm_settings_ai_provider_check 
CHECK (ai_provider IN ('internal', 'n8n', 'openai'));

-- Add comment explaining the fields
COMMENT ON COLUMN public.law_firm_settings.ai_provider IS 'AI provider: internal (MiauChat AI), n8n (workflow), openai (company API key)';
COMMENT ON COLUMN public.law_firm_settings.openai_api_key IS 'OpenAI API key for Enterprise plan (encrypted at rest by Supabase)';
COMMENT ON COLUMN public.law_firm_settings.ai_capabilities IS 'Enabled AI capabilities: auto_reply, summary, transcription, classification';