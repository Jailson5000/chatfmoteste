-- =============================================
-- MIGRATION: Add law_firm_id to messages table
-- Purpose: Enable efficient Realtime filtering per tenant
-- =============================================

-- Step 1: Add column (nullable to allow migration)
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS law_firm_id uuid REFERENCES public.law_firms(id) ON DELETE CASCADE;

-- Step 2: Backfill existing data
UPDATE public.messages m
SET law_firm_id = c.law_firm_id
FROM public.conversations c
WHERE m.conversation_id = c.id
AND m.law_firm_id IS NULL;

-- Step 3: Create trigger to auto-populate on INSERT
CREATE OR REPLACE FUNCTION public.set_message_law_firm_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.law_firm_id IS NULL THEN
    SELECT c.law_firm_id INTO NEW.law_firm_id
    FROM public.conversations c
    WHERE c.id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_message_law_firm_id ON public.messages;
CREATE TRIGGER trg_set_message_law_firm_id
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.set_message_law_firm_id();

-- Step 4: Create index for Realtime filter
CREATE INDEX IF NOT EXISTS idx_messages_law_firm_id 
ON public.messages (law_firm_id);

-- Step 5: Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_messages_law_firm_created 
ON public.messages (law_firm_id, created_at DESC);

-- Step 6: Update RLS policies to use direct column (more efficient)
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can manage messages in their conversations" ON public.messages;

CREATE POLICY "Users can view messages in their tenant"
ON public.messages FOR SELECT TO authenticated
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can insert messages in their tenant"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  law_firm_id = get_user_law_firm_id(auth.uid())
  OR law_firm_id IS NULL
);

CREATE POLICY "Users can update messages in their tenant"
ON public.messages FOR UPDATE TO authenticated
USING (law_firm_id = get_user_law_firm_id(auth.uid()))
WITH CHECK (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can delete messages in their tenant"
ON public.messages FOR DELETE TO authenticated
USING (law_firm_id = get_user_law_firm_id(auth.uid()));