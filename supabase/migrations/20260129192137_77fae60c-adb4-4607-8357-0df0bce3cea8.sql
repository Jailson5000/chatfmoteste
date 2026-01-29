-- Add RLS policy for tray_customer_map table
-- Uses connection_id -> tray_chat_integrations.law_firm_id for tenant isolation
-- Table is currently empty

CREATE POLICY "Tenant isolation for tray_customer_map" 
  ON public.tray_customer_map 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.tray_chat_integrations tci
      WHERE tci.id = tray_customer_map.connection_id
      AND (
        tci.law_firm_id = public.get_user_law_firm_id(auth.uid())
        OR public.is_admin(auth.uid())
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tray_chat_integrations tci
      WHERE tci.id = tray_customer_map.connection_id
      AND (
        tci.law_firm_id = public.get_user_law_firm_id(auth.uid())
        OR public.is_admin(auth.uid())
      )
    )
  );