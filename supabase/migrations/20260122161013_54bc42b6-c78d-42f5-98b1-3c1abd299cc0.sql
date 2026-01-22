-- Compatibilidade: alguns clientes antigos enviam source='online'
-- Mantemos a segurança via RLS; apenas ampliamos o CHECK para evitar falhas.
ALTER TABLE public.agenda_pro_appointments
  DROP CONSTRAINT IF EXISTS agenda_pro_appointments_source_check;

ALTER TABLE public.agenda_pro_appointments
  ADD CONSTRAINT agenda_pro_appointments_source_check
  CHECK (
    source = ANY (
      ARRAY[
        'manual'::text,
        'public_booking'::text,
        'whatsapp'::text,
        'phone'::text,
        'api'::text,
        'online'::text
      ]
    )
  );

-- Compatibilidade: versões antigas consultavam agenda_pro_working_hours.is_active.
-- Criamos coluna gerada a partir de is_enabled para não precisar de trigger.
ALTER TABLE public.agenda_pro_working_hours
  ADD COLUMN IF NOT EXISTS is_active boolean
  GENERATED ALWAYS AS (is_enabled) STORED;