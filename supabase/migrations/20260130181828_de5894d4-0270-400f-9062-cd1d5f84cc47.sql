-- Add weekend configuration columns to agenda_pro_settings
ALTER TABLE public.agenda_pro_settings
  ADD COLUMN IF NOT EXISTS saturday_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS saturday_start_time time DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS saturday_end_time time DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS sunday_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sunday_start_time time DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS sunday_end_time time DEFAULT '12:00';

-- Add comments for documentation
COMMENT ON COLUMN public.agenda_pro_settings.saturday_enabled IS 'Whether the business operates on Saturdays';
COMMENT ON COLUMN public.agenda_pro_settings.saturday_start_time IS 'Saturday opening time';
COMMENT ON COLUMN public.agenda_pro_settings.saturday_end_time IS 'Saturday closing time';
COMMENT ON COLUMN public.agenda_pro_settings.sunday_enabled IS 'Whether the business operates on Sundays';
COMMENT ON COLUMN public.agenda_pro_settings.sunday_start_time IS 'Sunday opening time';
COMMENT ON COLUMN public.agenda_pro_settings.sunday_end_time IS 'Sunday closing time';