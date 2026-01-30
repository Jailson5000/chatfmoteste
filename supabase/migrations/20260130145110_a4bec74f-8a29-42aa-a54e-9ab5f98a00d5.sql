-- Add last_seen_at column to profiles for tracking user activity
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

-- Create index for efficient ordering by last seen
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at 
ON public.profiles(last_seen_at DESC);

-- Update existing profiles to have a last_seen_at value
UPDATE public.profiles 
SET last_seen_at = COALESCE(updated_at, created_at, now())
WHERE last_seen_at IS NULL;