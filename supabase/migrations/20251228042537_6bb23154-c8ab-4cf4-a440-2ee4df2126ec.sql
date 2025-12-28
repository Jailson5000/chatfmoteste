-- Add default_status_id and default_assigned_to columns to whatsapp_instances table
ALTER TABLE public.whatsapp_instances 
ADD COLUMN default_status_id UUID REFERENCES public.custom_statuses(id) ON DELETE SET NULL,
ADD COLUMN default_assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.whatsapp_instances.default_status_id IS 'Default status to assign new clients from this instance';
COMMENT ON COLUMN public.whatsapp_instances.default_assigned_to IS 'Default responsible (user or AI) to assign new conversations from this instance';