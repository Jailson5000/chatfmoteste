-- Add can_access_archived column to existing table
ALTER TABLE public.member_department_access 
ADD COLUMN IF NOT EXISTS can_access_archived boolean NOT NULL DEFAULT false;

-- Create RPC to fetch archived access for a user
CREATE OR REPLACE FUNCTION public.get_member_archived_access_for_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT can_access_archived FROM member_department_access WHERE member_id = _user_id),
    false
  )
$$;