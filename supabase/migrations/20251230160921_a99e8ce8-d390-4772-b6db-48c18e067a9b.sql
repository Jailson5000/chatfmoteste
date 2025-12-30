-- Create agent_folders table for organizing AI agents
CREATE TABLE public.agent_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add folder_id column to automations table
ALTER TABLE public.automations 
ADD COLUMN folder_id UUID REFERENCES public.agent_folders(id) ON DELETE SET NULL;

-- Enable Row Level Security
ALTER TABLE public.agent_folders ENABLE ROW LEVEL SECURITY;

-- Create policies for agent_folders
CREATE POLICY "Users can view folders from their law firm"
ON public.agent_folders
FOR SELECT
USING (law_firm_id IN (SELECT law_firm_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create folders for their law firm"
ON public.agent_folders
FOR INSERT
WITH CHECK (law_firm_id IN (SELECT law_firm_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update folders from their law firm"
ON public.agent_folders
FOR UPDATE
USING (law_firm_id IN (SELECT law_firm_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete folders from their law firm"
ON public.agent_folders
FOR DELETE
USING (law_firm_id IN (SELECT law_firm_id FROM profiles WHERE id = auth.uid()));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_agent_folders_updated_at
BEFORE UPDATE ON public.agent_folders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();