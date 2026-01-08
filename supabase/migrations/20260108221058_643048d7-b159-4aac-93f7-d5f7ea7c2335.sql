-- Add column to track when the service-specific pre-message was sent
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS pre_message_sent_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN appointments.pre_message_sent_at IS 'Timestamp when the service-specific pre-appointment message was sent';