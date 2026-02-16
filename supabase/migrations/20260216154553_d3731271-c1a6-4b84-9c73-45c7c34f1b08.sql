
-- ============================================================
-- Tabela messages_archive: mesma estrutura de messages + archived_at
-- ============================================================
CREATE TABLE public.messages_archive (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  sender_type text NOT NULL,
  sender_id uuid,
  content text,
  message_type text NOT NULL DEFAULT 'text'::text,
  media_url text,
  media_mime_type text,
  is_from_me boolean NOT NULL DEFAULT false,
  whatsapp_message_id text,
  ai_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  reply_to_message_id uuid,
  delivered_at timestamptz,
  status text DEFAULT 'sent'::text,
  is_internal boolean NOT NULL DEFAULT false,
  ai_agent_id uuid,
  ai_agent_name text,
  is_revoked boolean DEFAULT false,
  revoked_at timestamptz,
  is_starred boolean DEFAULT false,
  is_pontual boolean DEFAULT false,
  my_reaction text,
  law_firm_id uuid,
  client_reaction text,
  external_id text,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- Indices otimizados para consultas de historico
CREATE INDEX idx_messages_archive_conv_created ON public.messages_archive (conversation_id, created_at DESC);
CREATE INDEX idx_messages_archive_law_firm ON public.messages_archive (law_firm_id);

-- ============================================================
-- RLS identica a tabela messages
-- ============================================================
ALTER TABLE public.messages_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view archived messages in their tenant"
  ON public.messages_archive FOR SELECT
  USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can insert archived messages in their tenant"
  ON public.messages_archive FOR INSERT
  WITH CHECK (law_firm_id = get_user_law_firm_id(auth.uid()) OR law_firm_id IS NULL);

CREATE POLICY "Users can delete archived messages in their tenant"
  ON public.messages_archive FOR DELETE
  USING (law_firm_id = get_user_law_firm_id(auth.uid()));

-- ============================================================
-- Funcao de arquivamento em batches
-- ============================================================
CREATE OR REPLACE FUNCTION public.archive_old_messages(
  _days_threshold integer DEFAULT 90,
  _batch_size integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _total_archived integer := 0;
  _batch_count integer := 0;
  _rows_moved integer;
  _batch_ids uuid[];
BEGIN
  LOOP
    -- Selecionar batch de mensagens para arquivar
    -- Excluir mensagens com is_starred = true
    SELECT array_agg(id) INTO _batch_ids
    FROM (
      SELECT id FROM public.messages
      WHERE created_at < now() - (_days_threshold || ' days')::interval
        AND (is_starred IS NULL OR is_starred = false)
      ORDER BY created_at ASC
      LIMIT _batch_size
      FOR UPDATE SKIP LOCKED
    ) sub;

    -- Se nao ha mais mensagens, sair do loop
    IF _batch_ids IS NULL OR array_length(_batch_ids, 1) IS NULL THEN
      EXIT;
    END IF;

    -- Desvincular reply_to_message_id de mensagens que apontam para as que serao arquivadas
    -- (evita FK violation se houver constraint)
    UPDATE public.messages
    SET reply_to_message_id = NULL
    WHERE reply_to_message_id = ANY(_batch_ids)
      AND NOT (id = ANY(_batch_ids));

    -- Mover para archive
    INSERT INTO public.messages_archive (
      id, conversation_id, sender_type, sender_id, content, message_type,
      media_url, media_mime_type, is_from_me, whatsapp_message_id, ai_generated,
      created_at, read_at, reply_to_message_id, delivered_at, status,
      is_internal, ai_agent_id, ai_agent_name, is_revoked, revoked_at,
      is_starred, is_pontual, my_reaction, law_firm_id, client_reaction, external_id,
      archived_at
    )
    SELECT
      id, conversation_id, sender_type, sender_id, content, message_type,
      media_url, media_mime_type, is_from_me, whatsapp_message_id, ai_generated,
      created_at, read_at, reply_to_message_id, delivered_at, status,
      is_internal, ai_agent_id, ai_agent_name, is_revoked, revoked_at,
      is_starred, is_pontual, my_reaction, law_firm_id, client_reaction, external_id,
      now()
    FROM public.messages
    WHERE id = ANY(_batch_ids);

    -- Deletar originais
    DELETE FROM public.messages WHERE id = ANY(_batch_ids);
    
    GET DIAGNOSTICS _rows_moved = ROW_COUNT;
    _total_archived := _total_archived + _rows_moved;
    _batch_count := _batch_count + 1;

    -- Pausa entre batches para nao sobrecarregar
    PERFORM pg_sleep(0.1);
  END LOOP;

  -- Registrar resultado em system_settings
  INSERT INTO system_settings (key, value, description, category, updated_at)
  VALUES (
    'last_message_archival',
    jsonb_build_object(
      'archived', _total_archived,
      'batches', _batch_count,
      'threshold_days', _days_threshold,
      'ran_at', now()
    ),
    'Ultimo resultado do arquivamento automatico de mensagens',
    'maintenance',
    now()
  )
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'total_archived', _total_archived,
    'batches_processed', _batch_count
  );
END;
$$;
