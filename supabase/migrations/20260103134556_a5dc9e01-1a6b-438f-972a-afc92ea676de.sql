
-- =====================================================
-- MELHORIA 1: Tenant-safe agent_knowledge
-- =====================================================

-- 1.1 Adicionar coluna law_firm_id
ALTER TABLE public.agent_knowledge 
ADD COLUMN IF NOT EXISTS law_firm_id uuid;

-- 1.2 Popular com dados existentes (baseado em automations)
UPDATE public.agent_knowledge ak
SET law_firm_id = a.law_firm_id
FROM public.automations a
WHERE ak.automation_id = a.id
  AND ak.law_firm_id IS NULL;

-- 1.3 Tornar NOT NULL após população
ALTER TABLE public.agent_knowledge 
ALTER COLUMN law_firm_id SET NOT NULL;

-- 1.4 Adicionar FK para law_firms
ALTER TABLE public.agent_knowledge
ADD CONSTRAINT fk_agent_knowledge_law_firm
FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;

-- 1.5 Criar função para validar tenant consistency
CREATE OR REPLACE FUNCTION public.validate_agent_knowledge_tenant()
RETURNS TRIGGER AS $$
DECLARE
  automation_tenant uuid;
  knowledge_tenant uuid;
BEGIN
  -- Buscar tenant da automação
  SELECT law_firm_id INTO automation_tenant
  FROM public.automations WHERE id = NEW.automation_id;
  
  -- Buscar tenant do knowledge item
  SELECT law_firm_id INTO knowledge_tenant
  FROM public.knowledge_items WHERE id = NEW.knowledge_item_id;
  
  -- Validar que todos pertencem ao mesmo tenant
  IF automation_tenant IS NULL OR knowledge_tenant IS NULL THEN
    RAISE EXCEPTION 'Automation or Knowledge Item not found';
  END IF;
  
  IF automation_tenant != knowledge_tenant THEN
    RAISE EXCEPTION 'Cross-tenant linking not allowed: automation belongs to % but knowledge belongs to %', 
      automation_tenant, knowledge_tenant;
  END IF;
  
  IF NEW.law_firm_id != automation_tenant THEN
    RAISE EXCEPTION 'law_firm_id mismatch: provided % but automation belongs to %',
      NEW.law_firm_id, automation_tenant;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.6 Criar trigger para validação
DROP TRIGGER IF EXISTS validate_agent_knowledge_tenant_trigger ON public.agent_knowledge;
CREATE TRIGGER validate_agent_knowledge_tenant_trigger
BEFORE INSERT OR UPDATE ON public.agent_knowledge
FOR EACH ROW EXECUTE FUNCTION public.validate_agent_knowledge_tenant();

-- 1.7 Atualizar RLS para usar law_firm_id diretamente (mais eficiente)
DROP POLICY IF EXISTS "Users can view agent knowledge in their law firm" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Admins can manage agent knowledge" ON public.agent_knowledge;

CREATE POLICY "Users can view agent knowledge in their law firm"
ON public.agent_knowledge FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can manage agent knowledge"
ON public.agent_knowledge FOR ALL
USING (
  law_firm_id = get_user_law_firm_id(auth.uid()) AND
  has_role(auth.uid(), 'admin'::app_role)
);

-- =====================================================
-- MELHORIA 2: FK em conversations.current_automation_id
-- =====================================================

-- 2.1 Limpar IDs órfãos (se existirem)
UPDATE public.conversations c
SET current_automation_id = NULL
WHERE current_automation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.automations a WHERE a.id = c.current_automation_id
  );

-- 2.2 Adicionar FK com SET NULL (preserva histórico)
ALTER TABLE public.conversations
ADD CONSTRAINT fk_conversations_current_automation
FOREIGN KEY (current_automation_id) 
REFERENCES public.automations(id) 
ON DELETE SET NULL;

-- =====================================================
-- MELHORIA 3: Índices de performance
-- =====================================================

-- 3.1 Índice composto para listagem de conversas por tenant + IA
CREATE INDEX IF NOT EXISTS idx_conversations_law_firm_automation 
ON public.conversations(law_firm_id, current_automation_id);

-- 3.2 Índices individuais em agent_knowledge
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_automation 
ON public.agent_knowledge(automation_id);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_knowledge_item 
ON public.agent_knowledge(knowledge_item_id);

-- 3.3 Índice composto tenant-safe em agent_knowledge
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_law_firm_automation 
ON public.agent_knowledge(law_firm_id, automation_id);

-- 3.4 Índice para busca de automations por tenant
CREATE INDEX IF NOT EXISTS idx_automations_law_firm_active 
ON public.automations(law_firm_id, is_active) WHERE is_active = true;
