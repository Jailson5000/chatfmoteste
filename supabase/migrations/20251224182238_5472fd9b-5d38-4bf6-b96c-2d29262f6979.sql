-- Create client_actions table for transfer and action history
CREATE TABLE public.client_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'transfer_handler', 'transfer_department', 'status_change', 'note_added', 'message_sent', etc.
  from_value TEXT,
  to_value TEXT,
  description TEXT,
  performed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_actions ENABLE ROW LEVEL SECURITY;

-- Policies for client_actions
CREATE POLICY "Users can view actions in their law firm"
ON public.client_actions
FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can insert actions in their law firm"
ON public.client_actions
FOR INSERT
WITH CHECK (law_firm_id = get_user_law_firm_id(auth.uid()));

-- Add media_url to templates table for storing file references
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS media_type TEXT;

-- Add second phone to law_firms
ALTER TABLE public.law_firms ADD COLUMN IF NOT EXISTS phone2 TEXT;