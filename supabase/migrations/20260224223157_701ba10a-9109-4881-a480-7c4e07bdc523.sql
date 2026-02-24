ALTER TABLE public.agenda_pro_settings 
ADD COLUMN whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;