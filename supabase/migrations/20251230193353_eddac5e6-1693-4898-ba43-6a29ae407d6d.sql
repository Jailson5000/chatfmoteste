-- Adicionar novos campos na tabela plans
ALTER TABLE public.plans
ADD COLUMN IF NOT EXISTS max_ai_conversations integer DEFAULT 250,
ADD COLUMN IF NOT EXISTS max_tts_minutes integer DEFAULT 40,
ADD COLUMN IF NOT EXISTS max_agents integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_workspaces integer DEFAULT 1;

-- Criar tabela de uso para medir consumo por empresa
CREATE TABLE IF NOT EXISTS public.usage_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id uuid NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  usage_type text NOT NULL, -- 'ai_conversation', 'tts_audio', 'transcription'
  count integer NOT NULL DEFAULT 1,
  duration_seconds integer, -- para áudios
  billing_period text NOT NULL, -- '2025-01' formato YYYY-MM
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_usage_records_law_firm_period 
ON public.usage_records(law_firm_id, billing_period);

CREATE INDEX IF NOT EXISTS idx_usage_records_type_period 
ON public.usage_records(usage_type, billing_period);

-- Enable RLS
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;

-- Policies para usage_records
CREATE POLICY "Service role has full access to usage_records"
ON public.usage_records FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE POLICY "Users can view usage in their law firm"
ON public.usage_records FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can view all usage"
ON public.usage_records FOR SELECT
USING (is_admin(auth.uid()));

-- Comentários
COMMENT ON TABLE public.usage_records IS 'Registros de uso de IA por empresa para billing';
COMMENT ON COLUMN public.usage_records.usage_type IS 'Tipo: ai_conversation, tts_audio, transcription';
COMMENT ON COLUMN public.usage_records.duration_seconds IS 'Duração em segundos para áudios TTS';