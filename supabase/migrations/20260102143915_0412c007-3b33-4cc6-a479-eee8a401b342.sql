
-- Add RLS policies to allow Global Admins to access profiles across all companies
CREATE POLICY "Global admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Add RLS policies to allow Global Admins to access automations across all companies
CREATE POLICY "Global admins can view all automations"
ON public.automations FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Add RLS policies to allow Global Admins to access conversations across all companies
CREATE POLICY "Global admins can view all conversations"
ON public.conversations FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Add RLS policies to allow Global Admins to access messages across all companies
CREATE POLICY "Global admins can view all messages"
ON public.messages FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Add RLS policies to allow Global Admins to access usage_records across all companies
CREATE POLICY "Global admins can view all usage records"
ON public.usage_records FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));
