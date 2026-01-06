-- Create table to track instance status changes over time
CREATE TABLE public.instance_status_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    previous_status TEXT,
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_instance_status_history_instance ON public.instance_status_history(instance_id);
CREATE INDEX idx_instance_status_history_changed_at ON public.instance_status_history(changed_at DESC);

-- Enable RLS
ALTER TABLE public.instance_status_history ENABLE ROW LEVEL SECURITY;

-- Only admins can view status history
CREATE POLICY "Admins can view instance status history"
ON public.instance_status_history
FOR SELECT
USING (is_admin(auth.uid()));

-- System can insert status history
CREATE POLICY "System can insert status history"
ON public.instance_status_history
FOR INSERT
WITH CHECK (true);

-- Add columns to whatsapp_instances for alert tracking
ALTER TABLE public.whatsapp_instances
ADD COLUMN IF NOT EXISTS disconnected_since TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMP WITH TIME ZONE;

-- Create trigger to track status changes
CREATE OR REPLACE FUNCTION public.track_instance_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only track if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Record the status change
        INSERT INTO public.instance_status_history (instance_id, status, previous_status, changed_at)
        VALUES (NEW.id, NEW.status, OLD.status, NOW());
        
        -- Update disconnected_since tracking
        IF NEW.status IN ('disconnected', 'error', 'suspended') AND OLD.status = 'connected' THEN
            NEW.disconnected_since := NOW();
        ELSIF NEW.status = 'connected' THEN
            NEW.disconnected_since := NULL;
            NEW.last_alert_sent_at := NULL;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on whatsapp_instances
DROP TRIGGER IF EXISTS track_status_change ON public.whatsapp_instances;
CREATE TRIGGER track_status_change
    BEFORE UPDATE ON public.whatsapp_instances
    FOR EACH ROW
    EXECUTE FUNCTION public.track_instance_status_change();

-- Enable realtime for status history
ALTER PUBLICATION supabase_realtime ADD TABLE public.instance_status_history;