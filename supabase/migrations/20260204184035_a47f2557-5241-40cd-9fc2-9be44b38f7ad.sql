-- Drop existing policy
DROP POLICY IF EXISTS "Allow public read for payment and registration settings" ON system_settings;

-- Create updated policy including onboarding_meeting_url
CREATE POLICY "Allow public read for public settings"
  ON system_settings FOR SELECT
  USING (
    key IN (
      'payment_provider', 
      'payments_disabled', 
      'manual_registration_enabled',
      'onboarding_meeting_url'
    )
  );
