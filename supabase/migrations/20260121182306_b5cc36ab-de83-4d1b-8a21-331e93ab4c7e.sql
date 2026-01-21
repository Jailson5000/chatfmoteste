
-- =====================================================
-- SECURITY FIX: Profiles table exposure
-- =====================================================
-- The "Global admins can view all profiles" policy allows 
-- global admins to see ALL profiles. We need to ensure 
-- regular users can only see profiles in their law_firm.
-- Global admins should still be able to view all for management.

-- The current RLS is actually correct:
-- 1. "Users can view profiles in their law firm" - uses law_firm_id check
-- 2. "Global admins can view all profiles" - for admin panel management
-- These are OR-ed together (PERMISSIVE), so regular users only see their law_firm

-- However, we should verify profiles RLS is working correctly
-- No changes needed for profiles - the current policies are appropriate

-- =====================================================
-- SECURITY FIX: Google Calendar tokens exposure
-- =====================================================
-- Create a secure view that hides sensitive tokens
-- This view will be used by the frontend instead of direct table access

-- Step 1: Create a secure view without tokens
CREATE OR REPLACE VIEW public.google_calendar_integrations_safe
WITH (security_invoker = on) AS
SELECT 
    id,
    law_firm_id,
    google_email,
    google_account_id,
    default_calendar_id,
    default_calendar_name,
    allow_read_events,
    allow_create_events,
    allow_edit_events,
    allow_delete_events,
    last_sync_at,
    next_sync_at,
    is_active,
    connected_by,
    connected_at,
    created_at,
    updated_at
    -- Deliberately excluding: access_token, refresh_token, token_expires_at, sync_token
FROM public.google_calendar_integrations;

-- Step 2: Grant permissions on the view
GRANT SELECT ON public.google_calendar_integrations_safe TO authenticated;

-- Step 3: Drop the existing SELECT policies that expose tokens
DROP POLICY IF EXISTS "Admins can view integration with tokens" ON public.google_calendar_integrations;

-- Step 4: Create a more restrictive SELECT policy
-- Only service_role should access tokens directly (edge functions)
-- Regular users should use the safe view
CREATE POLICY "No direct select - use safe view" 
ON public.google_calendar_integrations 
FOR SELECT 
USING (false);

-- Note: Edge functions use service_role which bypasses RLS, 
-- so they can still access tokens for OAuth operations
