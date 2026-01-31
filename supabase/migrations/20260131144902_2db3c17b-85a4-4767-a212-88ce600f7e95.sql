-- Create RPC function to get department IDs for a user
-- This avoids TypeScript infinite type instantiation issues with the member_departments table

CREATE OR REPLACE FUNCTION public.get_member_department_ids_for_user(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(department_id),
    '{}'::uuid[]
  )
  FROM member_departments
  WHERE member_id = _user_id;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_member_department_ids_for_user(uuid) TO authenticated;