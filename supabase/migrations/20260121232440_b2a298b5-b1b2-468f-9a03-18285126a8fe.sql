-- Add confirmation token to appointments
ALTER TABLE public.agenda_pro_appointments 
ADD COLUMN IF NOT EXISTS confirmation_token uuid DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS confirmation_link_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS confirmed_via text; -- 'link', 'whatsapp', 'phone', 'manual'

-- Create index for token lookups
CREATE INDEX IF NOT EXISTS idx_agenda_pro_appointments_confirmation_token 
ON public.agenda_pro_appointments(confirmation_token);

-- Allow public access to confirm appointments via token
CREATE POLICY "Allow public confirmation via token" 
ON public.agenda_pro_appointments 
FOR UPDATE
USING (confirmation_token IS NOT NULL)
WITH CHECK (confirmation_token IS NOT NULL);