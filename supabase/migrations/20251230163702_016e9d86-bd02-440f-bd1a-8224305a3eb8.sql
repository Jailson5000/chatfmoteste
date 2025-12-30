-- Tabela para armazenar fatos/memórias importantes sobre clientes
CREATE TABLE public.client_memories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    fact_type TEXT NOT NULL, -- 'preference', 'concern', 'legal_issue', 'personal', 'deadline', 'other'
    content TEXT NOT NULL,
    source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    importance INTEGER DEFAULT 5, -- 1-10 scale
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_client_memories_client_id ON public.client_memories(client_id);
CREATE INDEX idx_client_memories_law_firm_id ON public.client_memories(law_firm_id);
CREATE INDEX idx_client_memories_active ON public.client_memories(client_id, is_active) WHERE is_active = true;

-- Adicionar campo para rastrear última sumarização
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS last_summarized_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS summary_message_count INTEGER DEFAULT 0;

-- Enable RLS
ALTER TABLE public.client_memories ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view memories from their law firm" 
ON public.client_memories 
FOR SELECT 
USING (law_firm_id IN (
    SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can create memories for their law firm" 
ON public.client_memories 
FOR INSERT 
WITH CHECK (law_firm_id IN (
    SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can update memories from their law firm" 
ON public.client_memories 
FOR UPDATE 
USING (law_firm_id IN (
    SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can delete memories from their law firm" 
ON public.client_memories 
FOR DELETE 
USING (law_firm_id IN (
    SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()
));

-- Service role bypass for edge functions
CREATE POLICY "Service role has full access to client_memories"
ON public.client_memories
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- Trigger para updated_at
CREATE TRIGGER update_client_memories_updated_at
    BEFORE UPDATE ON public.client_memories
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();