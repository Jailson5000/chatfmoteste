-- Adiciona coluna para armazenar a reação enviada pelo usuário
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS my_reaction TEXT DEFAULT NULL;

-- Cria índice para consultas de mensagens com reações
CREATE INDEX IF NOT EXISTS idx_messages_my_reaction ON public.messages(my_reaction) WHERE my_reaction IS NOT NULL;