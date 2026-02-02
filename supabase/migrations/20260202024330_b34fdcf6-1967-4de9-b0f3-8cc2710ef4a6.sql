-- Remove hardcoded defaults from companies table
-- This ensures new companies use plan limits, not hardcoded values

-- Step 1: Remove column defaults
ALTER TABLE public.companies 
ALTER COLUMN max_users DROP DEFAULT,
ALTER COLUMN max_instances DROP DEFAULT;

-- Step 2: Clean existing data - set NULL for companies that should use plan limits
-- This fixes the "Miau test" and similar cases where use_custom_limits=false
UPDATE public.companies 
SET max_users = NULL, max_instances = NULL 
WHERE use_custom_limits = false OR use_custom_limits IS NULL;