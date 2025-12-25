-- Add unique constraint on whatsapp_message_id to prevent duplicate messages
CREATE UNIQUE INDEX IF NOT EXISTS messages_whatsapp_message_id_unique 
ON public.messages (whatsapp_message_id) 
WHERE whatsapp_message_id IS NOT NULL;