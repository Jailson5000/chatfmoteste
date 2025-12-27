-- Add notification preferences to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS notification_sound_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notification_browser_enabled BOOLEAN NOT NULL DEFAULT true;