-- Step 1: Add overage control columns to companies table
ALTER TABLE public.companies 
ADD COLUMN allow_ai_overage BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN allow_tts_overage BOOLEAN NOT NULL DEFAULT false;

-- Add comments
COMMENT ON COLUMN public.companies.allow_ai_overage IS 'When true, allows usage beyond max_ai_conversations limit with additional charges';
COMMENT ON COLUMN public.companies.allow_tts_overage IS 'When true, allows usage beyond max_tts_minutes limit with additional charges';