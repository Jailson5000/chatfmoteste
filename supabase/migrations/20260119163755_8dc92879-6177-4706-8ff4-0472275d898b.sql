-- Fix the get_widget_config function with correct column name
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
    t.welcome_message,
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