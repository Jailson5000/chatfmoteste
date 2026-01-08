-- Add columns for custom reminder and confirmation message templates
ALTER TABLE law_firms 
ADD COLUMN IF NOT EXISTS reminder_message_template TEXT,
ADD COLUMN IF NOT EXISTS confirmation_message_template TEXT;

-- Add default templates as comments for documentation
COMMENT ON COLUMN law_firms.reminder_message_template IS 'Template para mensagem de lembrete. Variáveis: {nome}, {data}, {horario}, {servico}, {empresa}';
COMMENT ON COLUMN law_firms.confirmation_message_template IS 'Template para mensagem de confirmação. Variáveis: {nome}, {data}, {horario}, {servico}, {empresa}';