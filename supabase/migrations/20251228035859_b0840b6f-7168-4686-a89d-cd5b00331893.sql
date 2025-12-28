-- Add column to store the last saved prompt (for restore feature)
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS last_prompt text;

-- Update trigger to save current prompt to last_prompt before updating
CREATE OR REPLACE FUNCTION public.backup_automation_prompt()
RETURNS TRIGGER AS $$
BEGIN
  -- Only backup if ai_prompt is actually changing
  IF OLD.ai_prompt IS DISTINCT FROM NEW.ai_prompt THEN
    NEW.last_prompt := OLD.ai_prompt;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for backing up prompt before update
DROP TRIGGER IF EXISTS backup_prompt_before_update ON public.automations;
CREATE TRIGGER backup_prompt_before_update
  BEFORE UPDATE ON public.automations
  FOR EACH ROW
  EXECUTE FUNCTION public.backup_automation_prompt();