
-- Retroactive fix: populate ai_agent_name from automations for messages that have ai_agent_id but null name
UPDATE public.messages
SET ai_agent_name = a.name
FROM public.automations a
WHERE messages.ai_agent_id = a.id
  AND messages.ai_agent_name IS NULL
  AND messages.ai_agent_id IS NOT NULL;

-- Trigger function: auto-populate ai_agent_name on INSERT when null
CREATE OR REPLACE FUNCTION public.set_ai_agent_name_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ai_agent_name IS NULL AND NEW.ai_agent_id IS NOT NULL THEN
    SELECT name INTO NEW.ai_agent_name
    FROM public.automations
    WHERE id = NEW.ai_agent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Attach trigger
CREATE TRIGGER trigger_set_ai_agent_name
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.set_ai_agent_name_on_insert();
