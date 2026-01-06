-- Add new fields to law_firms for general info and business hours
ALTER TABLE public.law_firms 
ADD COLUMN IF NOT EXISTS oab_number TEXT,
ADD COLUMN IF NOT EXISTS instagram TEXT,
ADD COLUMN IF NOT EXISTS facebook TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{
  "monday": {"enabled": true, "start": "08:00", "end": "18:00"},
  "tuesday": {"enabled": true, "start": "08:00", "end": "18:00"},
  "wednesday": {"enabled": true, "start": "08:00", "end": "18:00"},
  "thursday": {"enabled": true, "start": "08:00", "end": "18:00"},
  "friday": {"enabled": true, "start": "08:00", "end": "18:00"},
  "saturday": {"enabled": false, "start": "08:00", "end": "12:00"},
  "sunday": {"enabled": false, "start": "08:00", "end": "12:00"}
}'::jsonb;