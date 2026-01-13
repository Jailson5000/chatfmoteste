-- Enable REPLICA IDENTITY FULL on messages table for complete realtime UPDATE payloads
-- This ensures payload.old contains all fields, not just the primary key
ALTER TABLE public.messages REPLICA IDENTITY FULL;