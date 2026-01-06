-- Add give_up_status_id column to status_follow_ups table
ALTER TABLE public.status_follow_ups 
ADD COLUMN IF NOT EXISTS give_up_status_id uuid REFERENCES public.custom_statuses(id) ON DELETE SET NULL;