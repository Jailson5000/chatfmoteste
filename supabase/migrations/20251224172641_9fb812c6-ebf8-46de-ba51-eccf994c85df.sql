-- Drop and recreate the handle_new_profile function to make first user admin
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    is_first_user BOOLEAN;
BEGIN
    -- Check if this is the first user in the law firm
    SELECT NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE law_firm_id = NEW.law_firm_id 
        AND id != NEW.id
    ) INTO is_first_user;
    
    -- Assign role based on whether this is the first user
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
        IF is_first_user THEN
            -- First user of the law firm gets admin role
            INSERT INTO public.user_roles (user_id, role)
            VALUES (NEW.id, 'admin');
        ELSE
            -- Subsequent users get atendente role
            INSERT INTO public.user_roles (user_id, role)
            VALUES (NEW.id, 'atendente');
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;