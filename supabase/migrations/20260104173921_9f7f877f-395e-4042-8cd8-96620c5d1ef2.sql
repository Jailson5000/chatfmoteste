
-- Grant permissions on scheduled_follow_ups table to authenticated users and service role
GRANT ALL ON public.scheduled_follow_ups TO authenticated;
GRANT ALL ON public.scheduled_follow_ups TO service_role;
GRANT ALL ON public.scheduled_follow_ups TO postgres;
GRANT ALL ON public.scheduled_follow_ups TO anon;
