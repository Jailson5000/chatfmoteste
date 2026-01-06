-- Enable realtime for clients table
ALTER TABLE public.clients REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;