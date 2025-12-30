-- Add voice settings to law_firm_settings for AI audio responses
ALTER TABLE public.law_firm_settings
ADD COLUMN IF NOT EXISTS ai_voice_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_voice_id TEXT DEFAULT 'camila';

-- Add comments explaining the fields
COMMENT ON COLUMN public.law_firm_settings.ai_voice_enabled IS 'Enable AI audio responses';
COMMENT ON COLUMN public.law_firm_settings.ai_voice_id IS 'Voice ID for AI audio responses (OpenAI TTS voices)';