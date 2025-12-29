-- Add n8n_updated_at column to companies table if it doesn't exist
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS n8n_updated_at timestamp with time zone;