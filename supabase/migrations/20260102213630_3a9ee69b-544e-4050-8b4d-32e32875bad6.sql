-- Add default settings columns to tray_chat_integrations
ALTER TABLE public.tray_chat_integrations 
ADD COLUMN IF NOT EXISTS default_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS default_status_id uuid REFERENCES public.custom_statuses(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS default_automation_id uuid REFERENCES public.automations(id) ON DELETE SET NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.tray_chat_integrations.default_department_id IS 'Default department for new conversations from web chat';
COMMENT ON COLUMN public.tray_chat_integrations.default_status_id IS 'Default status for new clients from web chat';
COMMENT ON COLUMN public.tray_chat_integrations.default_automation_id IS 'Default AI agent to handle web chat conversations';