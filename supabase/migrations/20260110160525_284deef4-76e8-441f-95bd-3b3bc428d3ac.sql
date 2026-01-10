-- 1) Move pg_net extension to 'extensions' schema (recommended by Supabase)
-- First create the extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Drop and recreate pg_net in extensions schema
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- 2) Fix orphan conversations: link them to existing or new clients
-- This handles conversations that were created before the fix
DO $$
DECLARE
  _conv record;
  _client_id uuid;
  _phone_ending text;
BEGIN
  FOR _conv IN
    SELECT c.id, c.law_firm_id, c.whatsapp_instance_id, c.contact_phone, c.contact_name
    FROM public.conversations c
    WHERE c.client_id IS NULL
      AND c.whatsapp_instance_id IS NOT NULL
      AND c.contact_phone IS NOT NULL
  LOOP
    _phone_ending := RIGHT(_conv.contact_phone, 8);
    
    -- Try to find existing client for same phone + instance
    SELECT id INTO _client_id
    FROM public.clients
    WHERE law_firm_id = _conv.law_firm_id
      AND whatsapp_instance_id = _conv.whatsapp_instance_id
      AND (phone = _conv.contact_phone OR phone ILIKE '%' || _phone_ending)
    LIMIT 1;
    
    IF _client_id IS NULL THEN
      -- Create new client for this instance
      INSERT INTO public.clients (law_firm_id, name, phone, whatsapp_instance_id)
      VALUES (_conv.law_firm_id, COALESCE(_conv.contact_name, _conv.contact_phone), _conv.contact_phone, _conv.whatsapp_instance_id)
      RETURNING id INTO _client_id;
    END IF;
    
    -- Link conversation to client
    UPDATE public.conversations SET client_id = _client_id WHERE id = _conv.id;
  END LOOP;
END $$;