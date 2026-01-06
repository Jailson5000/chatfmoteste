-- Fix 1: Update handle_new_user() to create a law firm for each new user
-- This ensures every user has a law_firm_id from the start

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    new_law_firm_id uuid;
BEGIN
    -- Create a new law firm for this user
    INSERT INTO public.law_firms (name, email)
    VALUES (
        COALESCE(NEW.raw_user_meta_data->>'firm_name', CONCAT('Escritório de ', COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))),
        NEW.email
    )
    RETURNING id INTO new_law_firm_id;
    
    -- Create the profile with the law firm assigned
    INSERT INTO public.profiles (id, full_name, email, law_firm_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email,
        new_law_firm_id
    );
    
    RETURN NEW;
END;
$$;

-- Fix 2: Add constraint to ensure webhook URLs are HTTPS only (prevents SSRF)
-- First drop if exists to make migration idempotent
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'webhook_url_https_only'
    ) THEN
        ALTER TABLE public.automations 
        ADD CONSTRAINT webhook_url_https_only 
        CHECK (webhook_url ~ '^https://[a-zA-Z0-9]');
    END IF;
END $$;