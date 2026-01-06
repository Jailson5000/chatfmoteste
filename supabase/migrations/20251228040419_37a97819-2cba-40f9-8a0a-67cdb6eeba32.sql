-- Create knowledge_items table
CREATE TABLE public.knowledge_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id uuid NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  category text NOT NULL DEFAULT 'other',
  item_type text NOT NULL DEFAULT 'text', -- 'text' or 'document'
  file_url text,
  file_name text,
  file_type text,
  file_size integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create agent_knowledge junction table
CREATE TABLE public.agent_knowledge (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  knowledge_item_id uuid NOT NULL REFERENCES public.knowledge_items(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(automation_id, knowledge_item_id)
);

-- Enable RLS
ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;

-- RLS policies for knowledge_items
CREATE POLICY "Users can view knowledge items in their law firm"
ON public.knowledge_items FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can manage knowledge items"
ON public.knowledge_items FOR ALL
USING (law_firm_id = get_user_law_firm_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for agent_knowledge
CREATE POLICY "Users can view agent knowledge in their law firm"
ON public.agent_knowledge FOR SELECT
USING (EXISTS (
  SELECT 1 FROM automations a
  WHERE a.id = agent_knowledge.automation_id
  AND a.law_firm_id = get_user_law_firm_id(auth.uid())
));

CREATE POLICY "Admins can manage agent knowledge"
ON public.agent_knowledge FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) AND
  EXISTS (
    SELECT 1 FROM automations a
    WHERE a.id = agent_knowledge.automation_id
    AND a.law_firm_id = get_user_law_firm_id(auth.uid())
  )
);

-- Add state field to clients for map visualization
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS state text;

-- Create index for faster state queries
CREATE INDEX IF NOT EXISTS idx_clients_state ON public.clients(state);

-- Trigger for updated_at
CREATE TRIGGER update_knowledge_items_updated_at
  BEFORE UPDATE ON public.knowledge_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();