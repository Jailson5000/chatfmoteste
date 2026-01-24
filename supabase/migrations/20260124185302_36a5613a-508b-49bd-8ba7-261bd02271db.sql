
-- Adicionar colunas para controle de retry em mensagens agendadas
ALTER TABLE agenda_pro_scheduled_messages 
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error text,
ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- Criar índice para busca eficiente de mensagens para retry
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_retry 
ON agenda_pro_scheduled_messages(status, retry_count, scheduled_at) 
WHERE status IN ('pending', 'failed');

COMMENT ON COLUMN agenda_pro_scheduled_messages.retry_count IS 'Número de tentativas de envio';
COMMENT ON COLUMN agenda_pro_scheduled_messages.last_error IS 'Último erro de envio';
COMMENT ON COLUMN agenda_pro_scheduled_messages.last_attempt_at IS 'Última tentativa de envio';
