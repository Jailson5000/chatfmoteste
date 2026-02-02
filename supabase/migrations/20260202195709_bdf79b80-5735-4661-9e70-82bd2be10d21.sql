-- Adicionar coluna para reação do cliente em mensagens enviadas
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS client_reaction text;

-- Comentário explicativo
COMMENT ON COLUMN public.messages.client_reaction IS 
  'Emoji reaction sent by the client on this outgoing message';