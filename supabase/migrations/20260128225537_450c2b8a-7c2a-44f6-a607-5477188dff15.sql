-- 1. Adicionar política para Admin Global ver TODOS os profiles
DROP POLICY IF EXISTS "Global admins can view all profiles" ON public.profiles;
CREATE POLICY "Global admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

-- 2. Adicionar política para Admin Global ver TODOS os user_roles
DROP POLICY IF EXISTS "Global admins can view all user roles" ON public.user_roles;
CREATE POLICY "Global admins can view all user roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));