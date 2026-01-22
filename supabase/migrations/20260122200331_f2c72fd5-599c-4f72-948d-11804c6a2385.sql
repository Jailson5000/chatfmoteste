-- Add birthday message configuration fields to agenda_pro_settings
ALTER TABLE public.agenda_pro_settings 
ADD COLUMN IF NOT EXISTS birthday_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS birthday_message_template text DEFAULT 'Olá {client_name}! 🎂 A equipe {business_name} deseja um Feliz Aniversário! Que seu dia seja repleto de alegrias!',
ADD COLUMN IF NOT EXISTS birthday_include_coupon boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS birthday_coupon_type text DEFAULT 'discount',
ADD COLUMN IF NOT EXISTS birthday_coupon_value numeric DEFAULT 10,
ADD COLUMN IF NOT EXISTS birthday_coupon_service_id uuid REFERENCES public.agenda_pro_services(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS birthday_send_time text DEFAULT '09:00';

-- Add comments for documentation
COMMENT ON COLUMN public.agenda_pro_settings.birthday_enabled IS 'Enable birthday messages';
COMMENT ON COLUMN public.agenda_pro_settings.birthday_message_template IS 'Birthday message template';
COMMENT ON COLUMN public.agenda_pro_settings.birthday_include_coupon IS 'Include coupon/gift in birthday message';
COMMENT ON COLUMN public.agenda_pro_settings.birthday_coupon_type IS 'discount or service';
COMMENT ON COLUMN public.agenda_pro_settings.birthday_coupon_value IS 'Discount percentage or service price discount';
COMMENT ON COLUMN public.agenda_pro_settings.birthday_coupon_service_id IS 'Free service to offer on birthday';
COMMENT ON COLUMN public.agenda_pro_settings.birthday_send_time IS 'Time to send birthday messages';

-- Create table for scheduled messages (manual/editable)
CREATE TABLE IF NOT EXISTS public.agenda_pro_scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  law_firm_id uuid NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.agenda_pro_appointments(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.agenda_pro_clients(id) ON DELETE SET NULL,
  message_type text NOT NULL DEFAULT 'reminder',
  message_content text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  cancelled_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  channel text NOT NULL DEFAULT 'whatsapp',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agenda_pro_scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their law firm scheduled messages"
ON public.agenda_pro_scheduled_messages FOR SELECT
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can insert scheduled messages for their law firm"
ON public.agenda_pro_scheduled_messages FOR INSERT
WITH CHECK (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can update their law firm scheduled messages"
ON public.agenda_pro_scheduled_messages FOR UPDATE
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can delete their law firm scheduled messages"
ON public.agenda_pro_scheduled_messages FOR DELETE
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_law_firm ON public.agenda_pro_scheduled_messages(law_firm_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON public.agenda_pro_scheduled_messages(status, scheduled_at);

-- Add trigger for updated_at
CREATE TRIGGER update_scheduled_messages_updated_at
BEFORE UPDATE ON public.agenda_pro_scheduled_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();