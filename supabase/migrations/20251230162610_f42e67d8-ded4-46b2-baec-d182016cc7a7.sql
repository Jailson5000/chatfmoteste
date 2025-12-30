-- Add position column to automations for ordering within folders
ALTER TABLE public.automations 
ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- Create index for faster ordering queries
CREATE INDEX IF NOT EXISTS idx_automations_folder_position ON public.automations(folder_id, position);

-- Update existing automations to have sequential positions
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY folder_id ORDER BY created_at) - 1 as new_position
  FROM public.automations
)
UPDATE public.automations a
SET position = n.new_position
FROM numbered n
WHERE a.id = n.id;