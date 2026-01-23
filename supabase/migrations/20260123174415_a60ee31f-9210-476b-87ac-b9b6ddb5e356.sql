
-- SECURITY FIX: Remove overly permissive global admin policies
-- These policies allow system admins to access sensitive PII across all tenants
-- The proper tenant isolation is already enforced by the law_firm_id policies

-- Remove global admin policy from messages table
DROP POLICY IF EXISTS "Global admins can view all messages" ON public.messages;

-- Remove global admin policy from clients table  
DROP POLICY IF EXISTS "Global admins can view all clients" ON public.clients;

-- Remove global admin policy from profiles table
DROP POLICY IF EXISTS "Global admins can view all profiles" ON public.profiles;

-- Note: The following policies remain intact and provide proper tenant isolation:
-- - "Users can view messages in their conversations" 
-- - "Users can manage messages in their conversations"
-- - "Users can view clients in their law firm"
-- - "Users can view profiles in their law firm"
