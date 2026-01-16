-- Add column to track previous instance for orphan clients/conversations
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS last_whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS last_whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

-- Index for faster lookup during reassociation
CREATE INDEX IF NOT EXISTS idx_clients_last_instance ON public.clients(last_whatsapp_instance_id) WHERE whatsapp_instance_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_last_instance ON public.conversations(last_whatsapp_instance_id) WHERE whatsapp_instance_id IS NULL;

-- Function to reassociate orphans when instance reconnects
CREATE OR REPLACE FUNCTION public.reassociate_orphan_records(_instance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clients_updated integer := 0;
  _conversations_updated integer := 0;
BEGIN
  -- Reassociate orphan clients
  UPDATE public.clients
  SET 
    whatsapp_instance_id = _instance_id,
    last_whatsapp_instance_id = NULL,
    updated_at = now()
  WHERE last_whatsapp_instance_id = _instance_id
    AND whatsapp_instance_id IS NULL;
  
  GET DIAGNOSTICS _clients_updated = ROW_COUNT;

  -- Reassociate orphan conversations
  UPDATE public.conversations
  SET 
    whatsapp_instance_id = _instance_id,
    last_whatsapp_instance_id = NULL,
    updated_at = now()
  WHERE last_whatsapp_instance_id = _instance_id
    AND whatsapp_instance_id IS NULL;
  
  GET DIAGNOSTICS _conversations_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'clients_reassociated', _clients_updated,
    'conversations_reassociated', _conversations_updated
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.reassociate_orphan_records(uuid) TO authenticated;