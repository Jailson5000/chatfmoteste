-- Fix SECURITY DEFINER functions by adding explicit schema qualification
-- This hardens the functions against any future search_path manipulation

-- 1. Update has_role function with explicit schema qualification
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;

-- 2. Update get_user_law_firm_id function with explicit schema qualification
CREATE OR REPLACE FUNCTION public.get_user_law_firm_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT law_firm_id
    FROM public.profiles
    WHERE id = _user_id
$$;

-- 3. Update user_belongs_to_law_firm function with explicit schema qualification
CREATE OR REPLACE FUNCTION public.user_belongs_to_law_firm(_user_id uuid, _law_firm_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = _user_id
          AND law_firm_id = _law_firm_id
    )
$$;

-- Add comment for security review requirement
COMMENT ON FUNCTION public.has_role IS 'SECURITY CRITICAL: Any changes to this function require security review as it affects RLS policies.';
COMMENT ON FUNCTION public.get_user_law_firm_id IS 'SECURITY CRITICAL: Any changes to this function require security review as it affects RLS policies.';
COMMENT ON FUNCTION public.user_belongs_to_law_firm IS 'SECURITY CRITICAL: Any changes to this function require security review as it affects RLS policies.';