-- Add return/follow-up configuration to services
ALTER TABLE public.services 
ADD COLUMN IF NOT EXISTS return_interval_days INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS return_enabled BOOLEAN DEFAULT false;

-- Add return reference to appointments (link to original appointment)
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS original_appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_return BOOLEAN DEFAULT false;

-- Create index for efficient return lookup
CREATE INDEX IF NOT EXISTS idx_appointments_original ON public.appointments(original_appointment_id) WHERE original_appointment_id IS NOT NULL;

COMMENT ON COLUMN public.services.return_interval_days IS 'Default interval in days for scheduling returns (e.g., 30 for monthly)';
COMMENT ON COLUMN public.services.return_enabled IS 'Whether this service typically requires return visits';
COMMENT ON COLUMN public.appointments.original_appointment_id IS 'Reference to the original appointment if this is a return visit';
COMMENT ON COLUMN public.appointments.is_return IS 'Whether this appointment is a return/follow-up visit';