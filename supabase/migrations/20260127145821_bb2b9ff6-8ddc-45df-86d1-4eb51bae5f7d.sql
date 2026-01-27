-- Fase 1: Adicionar colunas de trial na tabela companies
ALTER TABLE public.companies 
  ADD COLUMN IF NOT EXISTS trial_type text DEFAULT 'none' 
    CHECK (trial_type IN ('none', 'auto_plan', 'manual')),
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_plan_id uuid REFERENCES public.plans(id);

-- Comentários para documentação
COMMENT ON COLUMN public.companies.trial_type IS 
  'Tipo de trial: none=sem trial, auto_plan=automático com plano, manual=aprovado manualmente';
COMMENT ON COLUMN public.companies.trial_started_at IS 
  'Data de início do período de trial';
COMMENT ON COLUMN public.companies.trial_plan_id IS 
  'Plano selecionado durante o trial (para cobrança futura)';

-- Fase 2: Inserir setting para controle global do trial automático
INSERT INTO public.system_settings (key, value, category, description)
VALUES (
  'auto_trial_with_plan_enabled', 
  'false', 
  'billing', 
  'Quando ativo, clientes que selecionam plano automaticamente recebem 7 dias de trial'
)
ON CONFLICT (key) DO NOTHING;