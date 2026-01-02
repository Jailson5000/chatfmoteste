-- Add RLS policy to allow Global Admins to view all WhatsApp instances
CREATE POLICY "Global admins can view all instances"
ON public.whatsapp_instances FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Add RLS policy to allow Global Admins to manage all WhatsApp instances
CREATE POLICY "Global admins can manage all instances"
ON public.whatsapp_instances FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));