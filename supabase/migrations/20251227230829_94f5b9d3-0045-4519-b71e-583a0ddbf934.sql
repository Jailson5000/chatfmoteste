-- Create law_firm_settings table for storing Evolution API configuration
CREATE TABLE public.law_firm_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id UUID NOT NULL UNIQUE REFERENCES public.law_firms(id) ON DELETE CASCADE,
  evolution_api_url TEXT,
  evolution_api_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.law_firm_settings ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view settings in their law firm
CREATE POLICY "Users can view law firm settings"
ON public.law_firm_settings
FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

-- RLS: Admins can manage settings
CREATE POLICY "Admins can manage law firm settings"
ON public.law_firm_settings
FOR ALL
USING (law_firm_id = get_user_law_firm_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_law_firm_settings_updated_at
BEFORE UPDATE ON public.law_firm_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();