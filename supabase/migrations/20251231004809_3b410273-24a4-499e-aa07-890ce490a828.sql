-- SECURITY FIX: Update handle_new_user to NOT create law_firms automatically
-- New users should ONLY come through the proper provisioning flow (create-company-admin)
-- This trigger should only create the profile, NOT a law_firm

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    -- Only create profile if it doesn't already exist
    -- The law_firm_id should be set by the provisioning process (create-company-admin)
    -- If a user is created without going through provisioning, they won't have a law_firm_id
    -- and will be blocked by the security checks in ProtectedRoute/useCompanyApproval
    INSERT INTO public.profiles (id, full_name, email, law_firm_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email,
        -- law_firm_id will be NULL unless set via provisioning
        (NEW.raw_user_meta_data->>'law_firm_id')::uuid
    )
    ON CONFLICT (id) DO NOTHING;
    
    RETURN NEW;
END;
$$;

-- Add comment explaining the security model
COMMENT ON FUNCTION public.handle_new_user() IS 
'Creates a profile for new users. law_firm_id must be provided via raw_user_meta_data by provisioning functions. Users without law_firm_id are blocked by ProtectedRoute.';