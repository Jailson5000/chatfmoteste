
-- =============================================
-- 1. Three missing composite indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_messages_conv_created 
  ON messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conv_fromme_created 
  ON messages(conversation_id, is_from_me, created_at);

CREATE INDEX IF NOT EXISTS idx_conversations_lawfirm_archived 
  ON conversations(law_firm_id, archived_at);

-- =============================================
-- 2. RPC get_dashboard_metrics_optimized
-- =============================================
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics_optimized(
  _law_firm_id uuid,
  _start_date timestamptz,
  _end_date timestamptz,
  _attendant_ids uuid[] DEFAULT NULL,
  _department_ids uuid[] DEFAULT NULL,
  _connection_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
  _has_filters boolean;
  _today date := CURRENT_DATE;
  _snapshot_start date := _start_date::date;
  _snapshot_end date := _end_date::date;
  _total_received bigint := 0;
  _total_sent bigint := 0;
  _snap_received bigint := 0;
  _snap_sent bigint := 0;
  _today_received bigint := 0;
  _today_sent bigint := 0;
  _total_conversations bigint := 0;
  _active_conversations bigint := 0;
  _archived_conversations bigint := 0;
  _caller_law_firm_id uuid;
BEGIN
  -- SECURITY: Validate caller
  _caller_law_firm_id := get_user_law_firm_id(auth.uid());
  IF _caller_law_firm_id IS NULL AND NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;
  IF _law_firm_id <> _caller_law_firm_id AND NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'access_denied');
  END IF;

  _has_filters := (
    (_attendant_ids IS NOT NULL AND array_length(_attendant_ids, 1) > 0) OR
    (_department_ids IS NOT NULL AND array_length(_department_ids, 1) > 0) OR
    (_connection_ids IS NOT NULL AND array_length(_connection_ids, 1) > 0)
  );

  IF NOT _has_filters THEN
    -- Use snapshots for past days
    SELECT COALESCE(SUM(messages_received), 0), COALESCE(SUM(messages_sent), 0)
    INTO _snap_received, _snap_sent
    FROM dashboard_daily_snapshots
    WHERE law_firm_id = _law_firm_id
      AND snapshot_date >= _snapshot_start
      AND snapshot_date < _today;

    -- Today's messages (real-time)
    IF _today >= _snapshot_start AND _today <= _snapshot_end THEN
      SELECT
        COALESCE(COUNT(*) FILTER (WHERE is_from_me = false), 0),
        COALESCE(COUNT(*) FILTER (WHERE is_from_me = true), 0)
      INTO _today_received, _today_sent
      FROM messages
      WHERE law_firm_id = _law_firm_id
        AND created_at >= _today::timestamptz
        AND created_at < (_today + interval '1 day')::timestamptz;
    END IF;

    _total_received := _snap_received + _today_received;
    _total_sent := _snap_sent + _today_sent;
  ELSE
    -- With filters: calculate everything from messages via filtered conversations
    SELECT
      COALESCE(COUNT(*) FILTER (WHERE m.is_from_me = false), 0),
      COALESCE(COUNT(*) FILTER (WHERE m.is_from_me = true), 0)
    INTO _total_received, _total_sent
    FROM messages m
    INNER JOIN conversations c ON c.id = m.conversation_id
    WHERE c.law_firm_id = _law_firm_id
      AND m.created_at >= _start_date
      AND m.created_at <= _end_date
      AND (_attendant_ids IS NULL OR array_length(_attendant_ids, 1) IS NULL OR c.assigned_to = ANY(_attendant_ids))
      AND (_department_ids IS NULL OR array_length(_department_ids, 1) IS NULL OR c.department_id = ANY(_department_ids))
      AND (_connection_ids IS NULL OR array_length(_connection_ids, 1) IS NULL OR c.whatsapp_instance_id = ANY(_connection_ids));
  END IF;

  -- Total conversations with activity in period
  SELECT COUNT(*) INTO _total_conversations
  FROM conversations c
  WHERE c.law_firm_id = _law_firm_id
    AND c.last_message_at >= _start_date
    AND c.last_message_at <= _end_date
    AND (_attendant_ids IS NULL OR array_length(_attendant_ids, 1) IS NULL OR c.assigned_to = ANY(_attendant_ids))
    AND (_department_ids IS NULL OR array_length(_department_ids, 1) IS NULL OR c.department_id = ANY(_department_ids))
    AND (_connection_ids IS NULL OR array_length(_connection_ids, 1) IS NULL OR c.whatsapp_instance_id = ANY(_connection_ids));

  -- Active conversations (not archived)
  SELECT COUNT(*) INTO _active_conversations
  FROM conversations c
  WHERE c.law_firm_id = _law_firm_id
    AND c.archived_at IS NULL
    AND (_attendant_ids IS NULL OR array_length(_attendant_ids, 1) IS NULL OR c.assigned_to = ANY(_attendant_ids))
    AND (_department_ids IS NULL OR array_length(_department_ids, 1) IS NULL OR c.department_id = ANY(_department_ids))
    AND (_connection_ids IS NULL OR array_length(_connection_ids, 1) IS NULL OR c.whatsapp_instance_id = ANY(_connection_ids));

  -- Archived conversations
  SELECT COUNT(*) INTO _archived_conversations
  FROM conversations c
  WHERE c.law_firm_id = _law_firm_id
    AND c.archived_at IS NOT NULL
    AND (_attendant_ids IS NULL OR array_length(_attendant_ids, 1) IS NULL OR c.assigned_to = ANY(_attendant_ids))
    AND (_department_ids IS NULL OR array_length(_department_ids, 1) IS NULL OR c.department_id = ANY(_department_ids))
    AND (_connection_ids IS NULL OR array_length(_connection_ids, 1) IS NULL OR c.whatsapp_instance_id = ANY(_connection_ids));

  RETURN jsonb_build_object(
    'total_received', _total_received,
    'total_sent', _total_sent,
    'total_conversations', _total_conversations,
    'active_conversations', _active_conversations,
    'archived_conversations', _archived_conversations
  );
END;
$$;
