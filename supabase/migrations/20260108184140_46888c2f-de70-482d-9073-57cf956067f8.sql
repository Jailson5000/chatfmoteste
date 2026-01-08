-- Add scheduling_enabled flag to automations table
ALTER TABLE public.automations 
ADD COLUMN IF NOT EXISTS scheduling_enabled BOOLEAN DEFAULT false;

-- Add index for quick lookup
CREATE INDEX IF NOT EXISTS idx_automations_scheduling 
ON public.automations(law_firm_id, scheduling_enabled) 
WHERE scheduling_enabled = true;