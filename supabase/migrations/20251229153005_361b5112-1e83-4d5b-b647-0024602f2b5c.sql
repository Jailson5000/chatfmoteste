-- Add must_change_password flag to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- Add initial access tracking to companies
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS admin_user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS initial_access_email_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS initial_access_email_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS initial_access_email_error TEXT;

-- Add event type to notification logs for tracking
COMMENT ON TABLE public.admin_notification_logs IS 'Logs of admin and onboarding email notifications sent by MIAUCHAT';