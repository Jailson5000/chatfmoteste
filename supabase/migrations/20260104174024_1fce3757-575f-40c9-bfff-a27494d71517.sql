
-- Grant permissions on all tables that the trigger function needs to access
-- The trigger reads from: status_follow_ups, conversations
-- The trigger writes to: scheduled_follow_ups

-- status_follow_ups - trigger reads follow-up rules
GRANT SELECT ON public.status_follow_ups TO authenticated;
GRANT SELECT ON public.status_follow_ups TO service_role;
GRANT SELECT ON public.status_follow_ups TO postgres;

-- conversations - trigger reads to find client's conversation  
GRANT SELECT ON public.conversations TO authenticated;
GRANT SELECT ON public.conversations TO service_role;
GRANT SELECT ON public.conversations TO postgres;

-- templates - trigger may need to read template info
GRANT SELECT ON public.templates TO authenticated;
GRANT SELECT ON public.templates TO service_role;
GRANT SELECT ON public.templates TO postgres;
