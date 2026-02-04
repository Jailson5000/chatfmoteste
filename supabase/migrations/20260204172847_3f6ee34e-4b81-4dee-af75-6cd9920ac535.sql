-- Política para admin global fazer CRUD nas etapas do onboarding
CREATE POLICY "Global admins can manage onboarding steps" ON public.onboarding_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.admin_profiles
      WHERE user_id = auth.uid()
    )
  );

-- Política para admin global gerenciar system_settings (para URL de agendamento)
CREATE POLICY "Global admins can manage system settings" ON public.system_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.admin_profiles
      WHERE user_id = auth.uid()
    )
  );