-- Table to store "No Department" access permission for members
CREATE TABLE public.member_department_access (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    can_access_no_department boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (member_id)
);

-- Enable RLS
ALTER TABLE public.member_department_access ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE TRIGGER update_member_department_access_updated_at
    BEFORE UPDATE ON public.member_department_access
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
-- Admin of tenant can manage all records in their law firm
CREATE POLICY "Admins can manage member_department_access"
ON public.member_department_access
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = auth.uid()
        JOIN public.profiles my_profile ON my_profile.id = auth.uid()
        WHERE p.id = member_id
          AND p.law_firm_id = my_profile.law_firm_id
          AND ur.role IN ('admin', 'gerente')
    )
    OR public.is_admin(auth.uid())
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = auth.uid()
        JOIN public.profiles my_profile ON my_profile.id = auth.uid()
        WHERE p.id = member_id
          AND p.law_firm_id = my_profile.law_firm_id
          AND ur.role IN ('admin', 'gerente')
    )
    OR public.is_admin(auth.uid())
);

-- Members can read their own record
CREATE POLICY "Members can read own access"
ON public.member_department_access
FOR SELECT
TO authenticated
USING (member_id = auth.uid());

-- RPC to get member's no-department access
CREATE OR REPLACE FUNCTION public.get_member_no_department_access_for_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT can_access_no_department FROM member_department_access WHERE member_id = _user_id),
    false
  )
$$;