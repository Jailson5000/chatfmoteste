-- Tabela para templates de agentes IA (gerenciados pelo Global Admin)
CREATE TABLE public.agent_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    icon text DEFAULT 'bot',
    
    -- Configurações do agente
    ai_prompt text NOT NULL,
    ai_temperature numeric DEFAULT 0.7,
    response_delay_seconds integer DEFAULT 2,
    
    -- Trigger config padrão
    trigger_type text NOT NULL DEFAULT 'message_received',
    trigger_config jsonb DEFAULT '{}'::jsonb,
    
    -- Capacidades de voz
    voice_enabled boolean DEFAULT false,
    voice_id text,
    
    -- Categorização
    category text DEFAULT 'geral',
    tags text[] DEFAULT '{}',
    
    -- Controle de publicação
    is_active boolean NOT NULL DEFAULT true,
    is_featured boolean DEFAULT false,
    display_order integer DEFAULT 0,
    
    -- Metadados
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    created_by uuid,
    
    -- Estatísticas de uso (quantas vezes foi clonado)
    usage_count integer DEFAULT 0
);

-- Habilitar RLS
ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

-- Política: Qualquer usuário autenticado pode ler templates ativos
CREATE POLICY "Authenticated users can read active agent templates"
ON public.agent_templates
FOR SELECT
TO authenticated
USING (is_active = true);

-- Política: Global Admins podem gerenciar todos os templates
CREATE POLICY "Global admins can manage agent templates"
ON public.agent_templates
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Índices para performance
CREATE INDEX idx_agent_templates_active ON public.agent_templates(is_active) WHERE is_active = true;
CREATE INDEX idx_agent_templates_category ON public.agent_templates(category);
CREATE INDEX idx_agent_templates_order ON public.agent_templates(display_order);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_agent_templates_updated_at
    BEFORE UPDATE ON public.agent_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir template de exemplo: Agente de Agendamento
INSERT INTO public.agent_templates (
    name,
    description,
    icon,
    category,
    ai_prompt,
    trigger_type,
    trigger_config,
    is_featured,
    display_order
) VALUES (
    'Agente de Agendamento',
    'Agente especializado em agendar horários e compromissos. Coleta informações do cliente e sugere horários disponíveis.',
    'calendar',
    'agendamento',
    'Você é um assistente especializado em agendamento de horários. Sua função é:

1. **Cumprimentar** o cliente de forma cordial
2. **Perguntar** qual serviço deseja agendar
3. **Coletar informações** necessárias:
   - Nome completo
   - Telefone de contato
   - Data e horário de preferência
4. **Sugerir horários** disponíveis quando solicitado
5. **Confirmar** os dados do agendamento antes de finalizar

Regras importantes:
- Seja sempre educado e profissional
- Não confirme horários sem ter todas as informações
- Se o cliente não souber o horário, sugira opções
- Ao finalizar, faça um resumo do agendamento

Variáveis disponíveis:
- {{nome_contato}} - Nome do contato
- {{nome_empresa}} - Nome da empresa',
    'message_received',
    '{"keywords": ["agendar", "marcar", "horário", "consulta", "agendamento"]}'::jsonb,
    true,
    1
);