-- Add default_department_id column to whatsapp_instances table
ALTER TABLE public.whatsapp_instances 
ADD COLUMN default_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.whatsapp_instances.default_department_id IS 'Default department to assign new clients from this instance';