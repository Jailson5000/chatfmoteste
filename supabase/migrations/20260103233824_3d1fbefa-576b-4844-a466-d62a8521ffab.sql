-- 1. Função para normalizar telefone (remover não-dígitos)
CREATE OR REPLACE FUNCTION public.normalize_phone(phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(phone, '\D', '', 'g')
$$;

-- 2. Índice único no telefone normalizado + law_firm_id (evita duplicados por tenant)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_normalized_law_firm
ON public.clients (normalize_phone(phone), law_firm_id);

-- 3. Configurar CASCADE DELETE nas FKs relacionadas ao client

-- conversations.client_id -> ON DELETE SET NULL (conversa fica órfã, depois apaga)
ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS conversations_client_id_fkey;

ALTER TABLE public.conversations
ADD CONSTRAINT conversations_client_id_fkey
FOREIGN KEY (client_id) REFERENCES public.clients(id)
ON DELETE CASCADE;

-- client_tags.client_id -> já tem FK, recriar com CASCADE
ALTER TABLE public.client_tags
DROP CONSTRAINT IF EXISTS client_tags_client_id_fkey;

ALTER TABLE public.client_tags
ADD CONSTRAINT client_tags_client_id_fkey
FOREIGN KEY (client_id) REFERENCES public.clients(id)
ON DELETE CASCADE;

-- client_actions.client_id -> CASCADE
ALTER TABLE public.client_actions
DROP CONSTRAINT IF EXISTS client_actions_client_id_fkey;

ALTER TABLE public.client_actions
ADD CONSTRAINT client_actions_client_id_fkey
FOREIGN KEY (client_id) REFERENCES public.clients(id)
ON DELETE CASCADE;

-- client_memories.client_id -> CASCADE
ALTER TABLE public.client_memories
DROP CONSTRAINT IF EXISTS client_memories_client_id_fkey;

ALTER TABLE public.client_memories
ADD CONSTRAINT client_memories_client_id_fkey
FOREIGN KEY (client_id) REFERENCES public.clients(id)
ON DELETE CASCADE;

-- consent_logs.client_id -> CASCADE
ALTER TABLE public.consent_logs
DROP CONSTRAINT IF EXISTS consent_logs_client_id_fkey;

ALTER TABLE public.consent_logs
ADD CONSTRAINT consent_logs_client_id_fkey
FOREIGN KEY (client_id) REFERENCES public.clients(id)
ON DELETE CASCADE;

-- cases.client_id -> CASCADE
ALTER TABLE public.cases
DROP CONSTRAINT IF EXISTS cases_client_id_fkey;

ALTER TABLE public.cases
ADD CONSTRAINT cases_client_id_fkey
FOREIGN KEY (client_id) REFERENCES public.clients(id)
ON DELETE CASCADE;

-- documents.client_id -> CASCADE
ALTER TABLE public.documents
DROP CONSTRAINT IF EXISTS documents_client_id_fkey;

ALTER TABLE public.documents
ADD CONSTRAINT documents_client_id_fkey
FOREIGN KEY (client_id) REFERENCES public.clients(id)
ON DELETE CASCADE;

-- google_calendar_events.client_id -> SET NULL (evento não precisa ser deletado)
ALTER TABLE public.google_calendar_events
DROP CONSTRAINT IF EXISTS google_calendar_events_client_id_fkey;

ALTER TABLE public.google_calendar_events
ADD CONSTRAINT google_calendar_events_client_id_fkey
FOREIGN KEY (client_id) REFERENCES public.clients(id)
ON DELETE SET NULL;

-- 4. Função para unificar contatos duplicados (mantém o mais antigo)
CREATE OR REPLACE FUNCTION public.unify_duplicate_clients(_law_firm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _phone_normalized text;
  _duplicate record;
  _primary_id uuid;
  _deleted_count integer := 0;
  _unified_phones text[] := '{}';
BEGIN
  -- Para cada telefone duplicado no tenant
  FOR _phone_normalized IN
    SELECT normalize_phone(phone)
    FROM public.clients
    WHERE law_firm_id = _law_firm_id
    GROUP BY normalize_phone(phone)
    HAVING COUNT(*) > 1
  LOOP
    -- Pegar o mais antigo como primário
    SELECT id INTO _primary_id
    FROM public.clients
    WHERE law_firm_id = _law_firm_id
      AND normalize_phone(phone) = _phone_normalized
    ORDER BY created_at ASC
    LIMIT 1;
    
    -- Transferir referências dos duplicados para o primário
    FOR _duplicate IN
      SELECT id FROM public.clients
      WHERE law_firm_id = _law_firm_id
        AND normalize_phone(phone) = _phone_normalized
        AND id != _primary_id
    LOOP
      -- Atualizar conversations para apontar pro primário
      UPDATE public.conversations SET client_id = _primary_id WHERE client_id = _duplicate.id;
      -- Atualizar client_tags
      UPDATE public.client_tags SET client_id = _primary_id WHERE client_id = _duplicate.id;
      -- Atualizar client_actions
      UPDATE public.client_actions SET client_id = _primary_id WHERE client_id = _duplicate.id;
      -- Atualizar client_memories
      UPDATE public.client_memories SET client_id = _primary_id WHERE client_id = _duplicate.id;
      -- Atualizar cases
      UPDATE public.cases SET client_id = _primary_id WHERE client_id = _duplicate.id;
      -- Atualizar documents
      UPDATE public.documents SET client_id = _primary_id WHERE client_id = _duplicate.id;
      -- Atualizar google_calendar_events
      UPDATE public.google_calendar_events SET client_id = _primary_id WHERE client_id = _duplicate.id;
      
      -- Deletar o duplicado
      DELETE FROM public.clients WHERE id = _duplicate.id;
      _deleted_count := _deleted_count + 1;
    END LOOP;
    
    _unified_phones := array_append(_unified_phones, _phone_normalized);
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', _deleted_count,
    'unified_phones', _unified_phones
  );
END;
$$;

-- 5. Grant execute para authenticated users
GRANT EXECUTE ON FUNCTION public.unify_duplicate_clients(uuid) TO authenticated;