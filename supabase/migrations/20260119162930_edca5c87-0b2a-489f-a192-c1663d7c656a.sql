-- Drop the problematic public policy that exposes all widget_keys
DROP POLICY IF EXISTS "Anyone can read active tray integrations by widget_key" ON public.tray_chat_integrations;

-- Create a secure RPC function to get integration config by widget_key
-- This function only returns non-sensitive data needed by the widget
CREATE OR REPLACE FUNCTION public.get_widget_config(p_widget_key text)
RETURNS TABLE (
  law_firm_id uuid,
  welcome_message text,
  widget_color text,
  is_active boolean,
  law_firm_name text,
  law_firm_logo_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.law_firm_id,
    t.default_welcome_message AS welcome_message,
    t.widget_color,
    t.is_active,
    lf.name AS law_firm_name,
    lf.logo_url AS law_firm_logo_url
  FROM public.tray_chat_integrations t
  JOIN public.law_firms lf ON lf.id = t.law_firm_id
  WHERE t.widget_key = p_widget_key
    AND t.is_active = true
  LIMIT 1;
END;
$$;

-- Grant execute permission to public (anonymous users)
GRANT EXECUTE ON FUNCTION public.get_widget_config(text) TO anon, authenticated;

-- Add comment for security review
COMMENT ON FUNCTION public.get_widget_config(text) IS 
'SECURITY CRITICAL: Returns only public-safe widget configuration data. 
Does NOT expose widget_key, activated_by, or other sensitive fields.
Only returns data when a valid widget_key is provided.';

-- Create policy for service role access only (for edge functions)
CREATE POLICY "Service role can read tray integrations" 
ON public.tray_chat_integrations 
FOR SELECT 
TO service_role
USING (true);