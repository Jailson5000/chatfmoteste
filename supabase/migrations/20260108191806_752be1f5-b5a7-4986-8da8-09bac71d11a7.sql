-- Add whatsapp_instance_id to clients table for default instance association
ALTER TABLE public.clients
ADD COLUMN whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

-- Add whatsapp_instance_id to appointments table for specific appointment notifications
ALTER TABLE public.appointments
ADD COLUMN whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_clients_whatsapp_instance ON public.clients(whatsapp_instance_id);
CREATE INDEX idx_appointments_whatsapp_instance ON public.appointments(whatsapp_instance_id);

-- Add comment for documentation
COMMENT ON COLUMN public.clients.whatsapp_instance_id IS 'WhatsApp instance associated with this client for sending messages';
COMMENT ON COLUMN public.appointments.whatsapp_instance_id IS 'WhatsApp instance to use for appointment notifications';