-- Alterar constraint de RESTRICT para SET NULL para professional_id
ALTER TABLE public.agenda_pro_appointments 
DROP CONSTRAINT IF EXISTS agenda_pro_appointments_professional_id_fkey;

ALTER TABLE public.agenda_pro_appointments
ADD CONSTRAINT agenda_pro_appointments_professional_id_fkey 
FOREIGN KEY (professional_id) 
REFERENCES public.agenda_pro_professionals(id) 
ON DELETE SET NULL;

-- Alterar constraint de RESTRICT para SET NULL para service_id
ALTER TABLE public.agenda_pro_appointments 
DROP CONSTRAINT IF EXISTS agenda_pro_appointments_service_id_fkey;

ALTER TABLE public.agenda_pro_appointments
ADD CONSTRAINT agenda_pro_appointments_service_id_fkey 
FOREIGN KEY (service_id) 
REFERENCES public.agenda_pro_services(id) 
ON DELETE SET NULL;

-- Alterar constraint para resource_id também (consistência)
ALTER TABLE public.agenda_pro_appointments 
DROP CONSTRAINT IF EXISTS agenda_pro_appointments_resource_id_fkey;

ALTER TABLE public.agenda_pro_appointments
ADD CONSTRAINT agenda_pro_appointments_resource_id_fkey 
FOREIGN KEY (resource_id) 
REFERENCES public.agenda_pro_resources(id) 
ON DELETE SET NULL;