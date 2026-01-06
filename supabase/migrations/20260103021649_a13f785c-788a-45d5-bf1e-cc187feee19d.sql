-- Criar tabela para auditoria de transferências entre IAs
-- Esta tabela registra todas as mudanças de current_automation_id nas conversas
CREATE TABLE IF NOT EXISTS public.ai_transfer_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    law_firm_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    from_agent_id UUID NULL, -- NULL se a conversa não tinha IA antes
    to_agent_id UUID NOT NULL, -- Nova IA atribuída
    from_agent_name TEXT NULL, -- Cache do nome para consultas históricas
    to_agent_name TEXT NOT NULL, -- Cache do nome para consultas históricas
    transferred_by UUID NULL, -- user_id de quem fez a transferência (NULL se automático)
    transferred_by_name TEXT NULL, -- Cache do nome do usuário
    transfer_type TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'auto_assignment', 'escalation'
    reason TEXT NULL, -- Motivo opcional da transferência
    metadata JSONB DEFAULT '{}'::jsonb, -- Dados adicionais
    transferred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_ai_transfer_logs_law_firm_id ON public.ai_transfer_logs(law_firm_id);
CREATE INDEX IF NOT EXISTS idx_ai_transfer_logs_conversation_id ON public.ai_transfer_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_transfer_logs_to_agent_id ON public.ai_transfer_logs(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_transfer_logs_transferred_at ON public.ai_transfer_logs(transferred_at DESC);

-- Foreign keys
ALTER TABLE public.ai_transfer_logs 
    ADD CONSTRAINT ai_transfer_logs_law_firm_id_fkey 
    FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE CASCADE;

ALTER TABLE public.ai_transfer_logs 
    ADD CONSTRAINT ai_transfer_logs_conversation_id_fkey 
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.ai_transfer_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Usuários podem ver logs de transferência de sua empresa
CREATE POLICY "Users can view transfer logs in their law firm" 
ON public.ai_transfer_logs 
FOR SELECT 
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

-- Sistema pode inserir logs (service_role)
CREATE POLICY "System can insert transfer logs" 
ON public.ai_transfer_logs 
FOR INSERT 
WITH CHECK (true);

-- Global admins podem ver todos os logs
CREATE POLICY "Global admins can view all transfer logs" 
ON public.ai_transfer_logs 
FOR SELECT 
USING (is_admin(auth.uid()));

-- Comentário na tabela
COMMENT ON TABLE public.ai_transfer_logs IS 'Logs de auditoria para transferências de conversas entre agentes de IA. Registra from_agent, to_agent, timestamps e metadados para garantir rastreabilidade completa.';