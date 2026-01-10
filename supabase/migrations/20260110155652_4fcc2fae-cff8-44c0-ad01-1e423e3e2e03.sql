-- Allow multiple clients with same phone across different WhatsApp instances
-- (keep uniqueness within the same instance, and within the "no instance" bucket)

-- 1) Drop old global uniqueness (per law_firm only)
DROP INDEX IF EXISTS public.idx_clients_phone_normalized_law_firm;

-- 2) Enforce uniqueness per (law_firm_id, whatsapp_instance_id, normalized_phone)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_norm_law_firm_instance
ON public.clients (normalize_phone(phone), law_firm_id, whatsapp_instance_id)
WHERE whatsapp_instance_id IS NOT NULL;

-- 3) Keep uniqueness for rows without whatsapp_instance_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_norm_law_firm_no_instance
ON public.clients (normalize_phone(phone), law_firm_id)
WHERE whatsapp_instance_id IS NULL;

-- 4) Update unification logic to only unify duplicates *within the same instance*
CREATE OR REPLACE FUNCTION public.unify_duplicate_clients(_law_firm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _group record;
  _duplicate record;
  _primary_id uuid;
  _deleted_count integer := 0;
  _unified_groups text[] := '{}';
BEGIN
  -- For each duplicated phone within the SAME instance (or within NULL instance)
  FOR _group IN
    SELECT normalize_phone(phone) AS phone_normalized,
           whatsapp_instance_id
    FROM public.clients
    WHERE law_firm_id = _law_firm_id
    GROUP BY normalize_phone(phone), whatsapp_instance_id
    HAVING COUNT(*) > 1
  LOOP
    -- Oldest as primary within that (phone, instance) group
    SELECT id INTO _primary_id
    FROM public.clients
    WHERE law_firm_id = _law_firm_id
      AND normalize_phone(phone) = _group.phone_normalized
      AND (whatsapp_instance_id IS NOT DISTINCT FROM _group.whatsapp_instance_id)
    ORDER BY created_at ASC
    LIMIT 1;

    -- Transfer references from duplicates to primary
    FOR _duplicate IN
      SELECT id
      FROM public.clients
      WHERE law_firm_id = _law_firm_id
        AND normalize_phone(phone) = _group.phone_normalized
        AND (whatsapp_instance_id IS NOT DISTINCT FROM _group.whatsapp_instance_id)
        AND id != _primary_id
    LOOP
      UPDATE public.conversations SET client_id = _primary_id WHERE client_id = _duplicate.id;
      UPDATE public.client_tags SET client_id = _primary_id WHERE client_id = _duplicate.id;
      UPDATE public.client_actions SET client_id = _primary_id WHERE client_id = _duplicate.id;
      UPDATE public.client_memories SET client_id = _primary_id WHERE client_id = _duplicate.id;
      UPDATE public.cases SET client_id = _primary_id WHERE client_id = _duplicate.id;
      UPDATE public.documents SET client_id = _primary_id WHERE client_id = _duplicate.id;
      UPDATE public.google_calendar_events SET client_id = _primary_id WHERE client_id = _duplicate.id;

      DELETE FROM public.clients WHERE id = _duplicate.id;
      _deleted_count := _deleted_count + 1;
    END LOOP;

    _unified_groups := array_append(
      _unified_groups,
      _group.phone_normalized || '|' || COALESCE(_group.whatsapp_instance_id::text, 'null')
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', _deleted_count,
    'unified_groups', _unified_groups
  );
END;
$function$;