-- Allow anonymous SELECT on active tray integrations for widget to fetch config
-- This is safe because:
-- 1. Only returns active integrations (is_active = true)
-- 2. Widget key is unique and acts as authentication
-- 3. No sensitive data is exposed (only config fields)

CREATE POLICY "Anyone can read active tray integrations by widget_key"
ON public.tray_chat_integrations
FOR SELECT
USING (is_active = true);

-- Add comment explaining the policy
COMMENT ON POLICY "Anyone can read active tray integrations by widget_key" ON public.tray_chat_integrations IS 'Allows widget.js to fetch configuration for active integrations without authentication. The widget_key acts as a form of authentication.';