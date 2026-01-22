-- Add second reminder configuration fields
ALTER TABLE public.agenda_pro_settings 
ADD COLUMN IF NOT EXISTS reminder_2_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS reminder_2_value integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS reminder_2_unit text DEFAULT 'hours',
ADD COLUMN IF NOT EXISTS respect_business_hours boolean DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.agenda_pro_settings.reminder_2_enabled IS 'Enable second reminder';
COMMENT ON COLUMN public.agenda_pro_settings.reminder_2_value IS 'Value for second reminder (number)';
COMMENT ON COLUMN public.agenda_pro_settings.reminder_2_unit IS 'Unit for second reminder: minutes or hours';
COMMENT ON COLUMN public.agenda_pro_settings.respect_business_hours IS 'Send reminders only during business hours';