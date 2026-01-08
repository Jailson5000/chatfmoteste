-- Add reminder settings columns to law_firms table
ALTER TABLE public.law_firms 
ADD COLUMN IF NOT EXISTS reminder_hours_before integer DEFAULT 24,
ADD COLUMN IF NOT EXISTS confirmation_hours_before integer DEFAULT 2;

-- Add comment for documentation
COMMENT ON COLUMN public.law_firms.reminder_hours_before IS 'Hours before appointment to send reminder (default 24)';
COMMENT ON COLUMN public.law_firms.confirmation_hours_before IS 'Hours before appointment to send confirmation request (default 2)';