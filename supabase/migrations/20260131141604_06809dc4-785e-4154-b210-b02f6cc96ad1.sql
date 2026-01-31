-- Add send_due_alert column to internal_tasks
ALTER TABLE public.internal_tasks 
ADD COLUMN IF NOT EXISTS send_due_alert boolean NOT NULL DEFAULT true;

-- Add task alert settings to law_firm_settings
ALTER TABLE public.law_firm_settings
ADD COLUMN IF NOT EXISTS task_alert_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS task_alert_hours_before integer NOT NULL DEFAULT 24,
ADD COLUMN IF NOT EXISTS task_alert_channels jsonb NOT NULL DEFAULT '["email"]'::jsonb,
ADD COLUMN IF NOT EXISTS task_alert_business_hours_only boolean NOT NULL DEFAULT true;

-- Create task_alert_logs table for deduplication
CREATE TABLE IF NOT EXISTS public.task_alert_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.internal_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  law_firm_id uuid NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id, channel)
);

-- Enable RLS on task_alert_logs
ALTER TABLE public.task_alert_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for task_alert_logs
CREATE POLICY "Users can view their law firm alert logs"
ON public.task_alert_logs FOR SELECT
USING (law_firm_id = (SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "System can insert alert logs"
ON public.task_alert_logs FOR INSERT
WITH CHECK (law_firm_id = (SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()));

-- Index for performance on task_alert_logs
CREATE INDEX IF NOT EXISTS idx_task_alert_logs_task_channel 
ON public.task_alert_logs(task_id, channel);

CREATE INDEX IF NOT EXISTS idx_task_alert_logs_law_firm 
ON public.task_alert_logs(law_firm_id);