-- Add N8N webhook configuration columns to law_firm_settings
ALTER TABLE public.law_firm_settings
ADD COLUMN IF NOT EXISTS n8n_webhook_url text,
ADD COLUMN IF NOT EXISTS n8n_webhook_secret text,
ADD COLUMN IF NOT EXISTS n8n_last_test_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS n8n_last_test_status text,
ADD COLUMN IF NOT EXISTS openai_last_test_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS openai_last_test_status text,
ADD COLUMN IF NOT EXISTS ai_settings_updated_by uuid,
ADD COLUMN IF NOT EXISTS ai_settings_updated_at timestamp with time zone DEFAULT now();

-- Add comment for documentation
COMMENT ON COLUMN public.law_firm_settings.n8n_webhook_url IS 'N8N webhook URL for automation processing';
COMMENT ON COLUMN public.law_firm_settings.n8n_webhook_secret IS 'Optional secret token for N8N webhook authentication';
COMMENT ON COLUMN public.law_firm_settings.n8n_last_test_at IS 'Last N8N webhook connection test timestamp';
COMMENT ON COLUMN public.law_firm_settings.n8n_last_test_status IS 'Result of last N8N connection test (success/error)';
COMMENT ON COLUMN public.law_firm_settings.openai_last_test_at IS 'Last OpenAI API key test timestamp';
COMMENT ON COLUMN public.law_firm_settings.openai_last_test_status IS 'Result of last OpenAI key test (success/error)';
COMMENT ON COLUMN public.law_firm_settings.ai_settings_updated_by IS 'User who last updated AI settings';
COMMENT ON COLUMN public.law_firm_settings.ai_settings_updated_at IS 'When AI settings were last updated';