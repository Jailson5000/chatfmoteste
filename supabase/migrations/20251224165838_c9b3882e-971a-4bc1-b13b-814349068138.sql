-- Add logo_url to law_firms
ALTER TABLE public.law_firms ADD COLUMN IF NOT EXISTS logo_url text;

-- Create templates table for quick messages
CREATE TABLE public.templates (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    law_firm_id uuid NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    name text NOT NULL,
    shortcut text NOT NULL,
    content text NOT NULL,
    category text DEFAULT 'geral',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add unique constraint for shortcut per law firm
ALTER TABLE public.templates ADD CONSTRAINT templates_law_firm_shortcut_unique UNIQUE (law_firm_id, shortcut);

-- Enable RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for templates
CREATE POLICY "Users can view templates in their law firm"
ON public.templates FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Admins can manage templates"
ON public.templates FOR ALL
USING (law_firm_id = get_user_law_firm_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for logos
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies for logos
CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'logos');

CREATE POLICY "Users can upload logos for their law firm"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'logos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'logos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'logos' AND auth.uid() IS NOT NULL);

-- Add trigger for updated_at on templates
CREATE TRIGGER update_templates_updated_at
BEFORE UPDATE ON public.templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();