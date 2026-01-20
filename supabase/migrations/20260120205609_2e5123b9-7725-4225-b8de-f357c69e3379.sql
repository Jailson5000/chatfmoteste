
-- Fix Google Calendar integrations default to be false (disabled by default)
ALTER TABLE public.google_calendar_integrations 
  ALTER COLUMN is_active SET DEFAULT false;

-- Comment explaining the change
COMMENT ON COLUMN public.google_calendar_integrations.is_active IS 'Integration active status. Defaults to false - integrations must be explicitly enabled by users.';
