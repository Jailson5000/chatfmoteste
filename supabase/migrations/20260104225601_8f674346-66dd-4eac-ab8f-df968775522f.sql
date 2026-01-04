DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ai_transfer_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_transfer_logs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'client_actions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_actions;
  END IF;
END $$;