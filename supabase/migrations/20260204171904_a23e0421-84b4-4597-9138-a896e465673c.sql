-- Tabela de etapas do onboarding (gerenciada pelo admin global)
CREATE TABLE public.onboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  youtube_id text,
  action_label text,
  action_route text,
  position integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de progresso do onboarding por empresa
CREATE TABLE public.onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES onboarding_steps(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, step_id)
);

-- Índices
CREATE INDEX idx_onboarding_progress_company ON onboarding_progress(company_id);
CREATE INDEX idx_onboarding_steps_position ON onboarding_steps(position);

-- RLS
ALTER TABLE onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;

-- Políticas: Etapas são públicas para leitura (autenticados)
CREATE POLICY "Authenticated users can view active steps" ON onboarding_steps
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Políticas: Global admins podem gerenciar etapas
CREATE POLICY "Global admins can manage steps" ON onboarding_steps
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

-- Políticas: Progresso é por empresa
CREATE POLICY "Users can view own company progress" ON onboarding_progress
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      JOIN law_firms lf ON lf.id = c.law_firm_id
      JOIN profiles p ON p.law_firm_id = lf.id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own company progress" ON onboarding_progress
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT c.id FROM companies c
      JOIN law_firms lf ON lf.id = c.law_firm_id
      JOIN profiles p ON p.law_firm_id = lf.id
      WHERE p.id = auth.uid()
    )
  );

-- Dados iniciais das etapas
INSERT INTO onboarding_steps (title, description, youtube_id, action_label, action_route, position) VALUES
  ('Dados do Escritório', 'Preencha as informações básicas do seu escritório', 'WzzqFzHKVsU', 'Preencher Dados', '/settings', 1),
  ('Conexão WhatsApp', 'Conecte seu número de WhatsApp ao sistema', 'JqdDXeAS89Q', 'Conectar WhatsApp', '/connections', 2),
  ('Configurar Agente', 'Crie e configure seu primeiro agente de IA', 'bVa-_99fZVA', 'Criar Agente', '/ai-agents', 3),
  ('Testar Agente', 'Faça um teste enviando mensagens para seu agente', NULL, 'Iniciar Teste', '/conversations', 4),
  ('Realizar Integração', 'Configure integrações adicionais (opcional)', NULL, 'Configurar', '/settings?tab=integracoes', 5);

-- URL de agendamento na tabela system_settings
INSERT INTO system_settings (key, value, description, category)
VALUES ('onboarding_meeting_url', '""', 'URL para agendamento de reunião de onboarding', 'onboarding')
ON CONFLICT (key) DO NOTHING;