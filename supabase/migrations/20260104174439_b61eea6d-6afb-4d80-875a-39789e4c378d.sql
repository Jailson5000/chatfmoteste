
-- Add policy to allow postgres role to read status_follow_ups (for trigger function)
CREATE POLICY "Allow postgres to read follow-ups"
ON public.status_follow_ups
FOR SELECT
TO postgres
USING (true);

-- Also add for conversations (trigger reads from it)
CREATE POLICY "Allow postgres to read conversations"
ON public.conversations
FOR SELECT
TO postgres
USING (true);
