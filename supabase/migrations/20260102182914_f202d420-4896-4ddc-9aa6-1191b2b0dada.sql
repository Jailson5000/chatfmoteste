-- Add version column to automations table
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Add comment explaining the column
COMMENT ON COLUMN public.automations.version IS 'Agent version number, increments on each save';