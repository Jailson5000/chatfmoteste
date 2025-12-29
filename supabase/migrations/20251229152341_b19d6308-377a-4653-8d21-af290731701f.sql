-- Create table for admin notification logs with deduplication
CREATE TABLE public.admin_notification_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  tenant_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  company_name TEXT,
  event_key TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  email_sent_to TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for deduplication lookups
CREATE INDEX idx_notification_logs_dedup ON public.admin_notification_logs(event_type, tenant_id, event_key, sent_at DESC);

-- Index for recent notifications
CREATE INDEX idx_notification_logs_recent ON public.admin_notification_logs(sent_at DESC);

-- Enable RLS
ALTER TABLE public.admin_notification_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view notification logs
CREATE POLICY "Admins can view notification logs" 
ON public.admin_notification_logs 
FOR SELECT 
USING (public.is_admin(auth.uid()));

-- Allow service role to insert (edge functions)
CREATE POLICY "Service role can insert notifications" 
ON public.admin_notification_logs 
FOR INSERT 
WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE public.admin_notification_logs IS 'Logs of admin email notifications sent by MIAUCHAT for deduplication and audit';