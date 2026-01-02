-- Adicionar campos de controle de áudio por conversa
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS ai_audio_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_audio_enabled_by text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_audio_last_enabled_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_audio_last_disabled_at timestamp with time zone DEFAULT NULL;

-- Comentários para documentação
COMMENT ON COLUMN public.conversations.ai_audio_enabled IS 'Indica se o modo áudio está ativo para esta conversa';
COMMENT ON COLUMN public.conversations.ai_audio_enabled_by IS 'Origem da ativação: user_request, manual_toggle, accessibility_need';
COMMENT ON COLUMN public.conversations.ai_audio_last_enabled_at IS 'Timestamp da última ativação do modo áudio';
COMMENT ON COLUMN public.conversations.ai_audio_last_disabled_at IS 'Timestamp da última desativação do modo áudio';

-- Índice para queries de conversas com áudio ativo
CREATE INDEX IF NOT EXISTS idx_conversations_audio_enabled ON public.conversations(ai_audio_enabled) WHERE ai_audio_enabled = true;