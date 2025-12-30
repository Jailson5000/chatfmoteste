-- =============================================
-- TEMPLATE BASE PARA CLONAGEM DE EMPRESAS
-- =============================================

-- 1. Tabela de Template Base de IA (singleton - apenas 1 registro ativo)
CREATE TABLE public.ai_template_base (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version integer NOT NULL DEFAULT 1,
    name text NOT NULL DEFAULT 'Template Padrão',
    description text,
    is_active boolean NOT NULL DEFAULT true,
    
    -- Configurações de IA padrão
    ai_provider text NOT NULL DEFAULT 'internal',
    ai_prompt text,
    ai_temperature numeric DEFAULT 0.7,
    response_delay_seconds integer DEFAULT 2,
    
    -- Capacidades de IA habilitadas por padrão
    ai_capabilities jsonb DEFAULT '{"auto_reply": true, "summary": true, "transcription": true, "classification": true}'::jsonb,
    
    -- Configurações de automação padrão
    default_automation_name text DEFAULT 'Atendente IA',
    default_automation_description text DEFAULT 'Agente de IA para atendimento automatizado',
    default_automation_trigger_type text DEFAULT 'message_received',
    default_automation_trigger_config jsonb DEFAULT '{}'::jsonb,
    
    -- Departamentos padrão a serem criados
    default_departments jsonb DEFAULT '[
        {"name": "Atendimento", "color": "#3B82F6", "icon": "headphones"},
        {"name": "Vendas", "color": "#10B981", "icon": "shopping-cart"},
        {"name": "Suporte", "color": "#F59E0B", "icon": "life-buoy"}
    ]'::jsonb,
    
    -- Status padrão a serem criados
    default_statuses jsonb DEFAULT '[
        {"name": "Novo", "color": "#6366F1", "position": 0},
        {"name": "Em Atendimento", "color": "#F59E0B", "position": 1},
        {"name": "Aguardando Cliente", "color": "#EF4444", "position": 2},
        {"name": "Concluído", "color": "#10B981", "position": 3}
    ]'::jsonb,
    
    -- Tags padrão
    default_tags jsonb DEFAULT '[
        {"name": "Urgente", "color": "#EF4444"},
        {"name": "VIP", "color": "#F59E0B"},
        {"name": "Novo Cliente", "color": "#10B981"}
    ]'::jsonb,
    
    -- Metadados
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

-- 2. Tabela de itens de conhecimento do template (base de conhecimento padrão)
CREATE TABLE public.template_knowledge_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id uuid NOT NULL REFERENCES public.ai_template_base(id) ON DELETE CASCADE,
    
    title text NOT NULL,
    content text,
    category text NOT NULL DEFAULT 'general',
    item_type text NOT NULL DEFAULT 'text',
    
    -- Arquivos (se aplicável)
    file_url text,
    file_name text,
    file_type text,
    file_size integer,
    
    position integer DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3. Tabela de histórico de versões do template
CREATE TABLE public.ai_template_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id uuid NOT NULL REFERENCES public.ai_template_base(id) ON DELETE CASCADE,
    version integer NOT NULL,
    
    -- Snapshot completo do template nesta versão
    template_snapshot jsonb NOT NULL,
    knowledge_items_snapshot jsonb,
    
    -- Metadados
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    created_by uuid,
    notes text
);

-- 4. Adicionar referência de qual versão do template a empresa foi criada
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS template_version integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS template_cloned_at timestamp with time zone;

-- 5. Índices para performance
CREATE INDEX idx_template_knowledge_items_template ON public.template_knowledge_items(template_id);
CREATE INDEX idx_template_versions_template ON public.ai_template_versions(template_id);
CREATE INDEX idx_companies_template_version ON public.companies(template_version);

-- 6. RLS para ai_template_base (somente admins globais)
ALTER TABLE public.ai_template_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage template base"
ON public.ai_template_base
FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view template base"
ON public.ai_template_base
FOR SELECT
USING (is_admin(auth.uid()));

-- 7. RLS para template_knowledge_items
ALTER TABLE public.template_knowledge_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage template knowledge"
ON public.template_knowledge_items
FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view template knowledge"
ON public.template_knowledge_items
FOR SELECT
USING (is_admin(auth.uid()));

-- 8. RLS para ai_template_versions
ALTER TABLE public.ai_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view template versions"
ON public.ai_template_versions
FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage template versions"
ON public.ai_template_versions
FOR ALL
USING (is_admin(auth.uid()));

-- 9. Trigger para atualizar updated_at
CREATE TRIGGER update_ai_template_base_updated_at
    BEFORE UPDATE ON public.ai_template_base
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_template_knowledge_items_updated_at
    BEFORE UPDATE ON public.template_knowledge_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 10. Inserir template base inicial
INSERT INTO public.ai_template_base (
    name,
    description,
    ai_provider,
    ai_prompt,
    ai_temperature,
    response_delay_seconds
) VALUES (
    'Template Padrão MiauChat',
    'Template base utilizado para novas empresas. Contém configurações iniciais de IA, departamentos, status e tags.',
    'internal',
    'Você é um assistente virtual profissional e cordial. Seu objetivo é ajudar os clientes de forma eficiente e amigável.

Diretrizes:
- Seja sempre educado e profissional
- Responda de forma clara e objetiva
- Se não souber a resposta, informe que vai encaminhar para um atendente humano
- Colete informações importantes sobre o cliente quando apropriado
- Use emojis com moderação para humanizar a conversa

Lembre-se: você representa a empresa, então mantenha sempre uma postura profissional.',
    0.7,
    2
);

-- 11. Função para clonar template para nova empresa
CREATE OR REPLACE FUNCTION public.clone_template_for_company(
    _law_firm_id uuid,
    _company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _template record;
    _result jsonb;
    _dept record;
    _status record;
    _tag record;
    _knowledge record;
    _automation_id uuid;
BEGIN
    -- Buscar template ativo
    SELECT * INTO _template
    FROM public.ai_template_base
    WHERE is_active = true
    ORDER BY version DESC
    LIMIT 1;
    
    IF _template IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhum template ativo encontrado');
    END IF;
    
    -- 1. Criar law_firm_settings baseado no template
    INSERT INTO public.law_firm_settings (
        law_firm_id,
        ai_provider,
        ai_capabilities
    ) VALUES (
        _law_firm_id,
        _template.ai_provider,
        _template.ai_capabilities
    )
    ON CONFLICT (law_firm_id) DO UPDATE SET
        ai_provider = EXCLUDED.ai_provider,
        ai_capabilities = EXCLUDED.ai_capabilities,
        updated_at = now();
    
    -- 2. Criar automação padrão
    INSERT INTO public.automations (
        law_firm_id,
        name,
        description,
        trigger_type,
        trigger_config,
        ai_prompt,
        ai_temperature,
        webhook_url,
        is_active
    ) VALUES (
        _law_firm_id,
        _template.default_automation_name,
        _template.default_automation_description,
        _template.default_automation_trigger_type,
        _template.default_automation_trigger_config,
        _template.ai_prompt,
        _template.ai_temperature,
        '',
        true
    )
    RETURNING id INTO _automation_id;
    
    -- 3. Criar departamentos padrão
    FOR _dept IN SELECT * FROM jsonb_array_elements(_template.default_departments)
    LOOP
        INSERT INTO public.departments (law_firm_id, name, color, icon, position)
        VALUES (
            _law_firm_id,
            _dept.value->>'name',
            _dept.value->>'color',
            _dept.value->>'icon',
            COALESCE((_dept.value->>'position')::integer, 0)
        );
    END LOOP;
    
    -- 4. Criar status padrão
    FOR _status IN SELECT * FROM jsonb_array_elements(_template.default_statuses)
    LOOP
        INSERT INTO public.custom_statuses (law_firm_id, name, color, position)
        VALUES (
            _law_firm_id,
            _status.value->>'name',
            _status.value->>'color',
            COALESCE((_status.value->>'position')::integer, 0)
        );
    END LOOP;
    
    -- 5. Criar tags padrão
    FOR _tag IN SELECT * FROM jsonb_array_elements(_template.default_tags)
    LOOP
        INSERT INTO public.tags (law_firm_id, name, color)
        VALUES (
            _law_firm_id,
            _tag.value->>'name',
            _tag.value->>'color'
        );
    END LOOP;
    
    -- 6. Clonar itens de conhecimento do template
    FOR _knowledge IN 
        SELECT * FROM public.template_knowledge_items 
        WHERE template_id = _template.id AND is_active = true
    LOOP
        INSERT INTO public.knowledge_items (
            law_firm_id,
            title,
            content,
            category,
            item_type,
            file_url,
            file_name,
            file_type,
            file_size
        ) VALUES (
            _law_firm_id,
            _knowledge.title,
            _knowledge.content,
            _knowledge.category,
            _knowledge.item_type,
            _knowledge.file_url,
            _knowledge.file_name,
            _knowledge.file_type,
            _knowledge.file_size
        );
    END LOOP;
    
    -- 7. Atualizar company com versão do template
    UPDATE public.companies
    SET 
        template_version = _template.version,
        template_cloned_at = now()
    WHERE id = _company_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'template_version', _template.version,
        'template_name', _template.name,
        'automation_id', _automation_id,
        'cloned_at', now()
    );
END;
$$;