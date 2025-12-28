-- Add job_title column to profiles for signature
ALTER TABLE public.profiles 
ADD COLUMN job_title text;