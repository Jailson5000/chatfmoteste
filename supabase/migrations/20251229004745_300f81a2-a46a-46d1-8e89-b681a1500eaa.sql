-- Add avatar_url column to clients table for WhatsApp profile picture
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS avatar_url text;