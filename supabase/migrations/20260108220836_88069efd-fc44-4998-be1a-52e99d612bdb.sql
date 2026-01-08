-- Add columns for service-specific pre-appointment messages
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS pre_message_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pre_message_text TEXT,
ADD COLUMN IF NOT EXISTS pre_message_hours_before INTEGER DEFAULT 48;

-- Add comments for documentation
COMMENT ON COLUMN services.pre_message_enabled IS 'Enable/disable pre-appointment message for this service';
COMMENT ON COLUMN services.pre_message_text IS 'Custom message template for this service. Variables: {nome}, {data}, {horario}, {servico}, {empresa}';
COMMENT ON COLUMN services.pre_message_hours_before IS 'Hours before appointment to send the pre-message';