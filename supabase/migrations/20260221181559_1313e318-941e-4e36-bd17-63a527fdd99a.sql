
-- Tabela de snapshots diários do dashboard
CREATE TABLE public.dashboard_daily_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  law_firm_id uuid NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  messages_received integer NOT NULL DEFAULT 0,
  messages_sent integer NOT NULL DEFAULT 0,
  conversations_active integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice único para evitar duplicatas
CREATE UNIQUE INDEX idx_dashboard_snapshots_unique 
  ON public.dashboard_daily_snapshots (law_firm_id, snapshot_date);

-- Índice para busca por tenant + range de datas
CREATE INDEX idx_dashboard_snapshots_lookup 
  ON public.dashboard_daily_snapshots (law_firm_id, snapshot_date DESC);

-- Habilitar RLS
ALTER TABLE public.dashboard_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Política: usuários só veem snapshots do próprio tenant
CREATE POLICY "Users can view own tenant snapshots"
  ON public.dashboard_daily_snapshots
  FOR SELECT
  USING (
    law_firm_id = (SELECT law_firm_id FROM public.profiles WHERE id = auth.uid())
    OR public.is_admin(auth.uid())
  );

-- Função que gera snapshots do dia anterior para todos os tenants ativos
CREATE OR REPLACE FUNCTION public.generate_daily_dashboard_snapshots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _target_date date := (CURRENT_DATE - interval '1 day')::date;
  _start_ts timestamptz := _target_date::timestamptz;
  _end_ts timestamptz := (_target_date + interval '1 day')::timestamptz;
BEGIN
  INSERT INTO public.dashboard_daily_snapshots (law_firm_id, snapshot_date, messages_received, messages_sent, conversations_active)
  SELECT
    lf.id AS law_firm_id,
    _target_date AS snapshot_date,
    COALESCE(msg_stats.received, 0) AS messages_received,
    COALESCE(msg_stats.sent, 0) AS messages_sent,
    COALESCE(conv_stats.active_convs, 0) AS conversations_active
  FROM public.law_firms lf
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE m.is_from_me = false) AS received,
      COUNT(*) FILTER (WHERE m.is_from_me = true) AS sent
    FROM public.messages m
    WHERE m.law_firm_id = lf.id
      AND m.created_at >= _start_ts
      AND m.created_at < _end_ts
  ) msg_stats ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT c.id) AS active_convs
    FROM public.conversations c
    WHERE c.law_firm_id = lf.id
      AND c.last_message_at >= _start_ts
      AND c.last_message_at < _end_ts
  ) conv_stats ON true
  ON CONFLICT (law_firm_id, snapshot_date) DO UPDATE SET
    messages_received = EXCLUDED.messages_received,
    messages_sent = EXCLUDED.messages_sent,
    conversations_active = EXCLUDED.conversations_active,
    created_at = now();
END;
$$;

-- Agendar cron job para rodar todo dia às 00:30 UTC
SELECT cron.schedule(
  'generate-daily-dashboard-snapshots',
  '30 0 * * *',
  $$SELECT public.generate_daily_dashboard_snapshots()$$
);
