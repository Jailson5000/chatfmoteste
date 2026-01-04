-- Add notify_on_transfer column to automations table
-- This controls whether the AI should notify the client when transferring to another department or human
-- Default is FALSE (AI does NOT notify the client)
ALTER TABLE public.automations
ADD COLUMN IF NOT EXISTS notify_on_transfer BOOLEAN NOT NULL DEFAULT false;