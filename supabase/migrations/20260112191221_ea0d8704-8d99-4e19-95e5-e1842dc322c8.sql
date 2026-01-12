-- Add foreign key constraint from clients.assigned_to to profiles.id for proper joins
-- Note: profiles.id matches auth.users.id, so this creates the link
ALTER TABLE public.clients 
ADD CONSTRAINT clients_assigned_to_profile_fkey 
FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;