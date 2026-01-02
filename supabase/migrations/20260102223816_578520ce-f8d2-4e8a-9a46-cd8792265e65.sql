-- Add default_automation_id to whatsapp_instances
-- This allows each WhatsApp instance to have a specific AI agent configured

ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS default_automation_id UUID REFERENCES public.automations(id) ON DELETE SET NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.whatsapp_instances.default_automation_id IS 'Default AI agent/automation to use for this WhatsApp instance';

-- Also add default_automation_id to law_firm_settings as a company-wide fallback
ALTER TABLE public.law_firm_settings 
ADD COLUMN IF NOT EXISTS default_automation_id UUID REFERENCES public.automations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.law_firm_settings.default_automation_id IS 'Default AI agent/automation for the company (used when instance has no specific agent)';