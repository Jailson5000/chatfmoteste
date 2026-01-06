-- Add display_name column to whatsapp_instances
-- This stores the user-friendly name while instance_name keeps the technical ID

ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS display_name text;

-- Update existing records to use instance_name as display_name if not set
UPDATE public.whatsapp_instances 
SET display_name = instance_name 
WHERE display_name IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.whatsapp_instances.display_name IS 'User-friendly display name for the WhatsApp connection';
COMMENT ON COLUMN public.whatsapp_instances.instance_name IS 'Technical identifier used by Evolution API';