-- Drop existing webhook_url constraint if exists
ALTER TABLE public.automations DROP CONSTRAINT IF EXISTS webhook_url_https_only;

-- Add more robust URL validation constraint
ALTER TABLE public.automations ADD CONSTRAINT webhook_url_https_only 
CHECK (
  webhook_url ~ '^https://[a-zA-Z0-9][a-zA-Z0-9\-]*(\.[a-zA-Z0-9\-]+)+(/.*)?$'
  AND webhook_url NOT LIKE '%localhost%'
  AND webhook_url NOT LIKE '%127.0.0.1%'
  AND webhook_url NOT LIKE '%10.%'
  AND webhook_url NOT LIKE '%172.16.%'
  AND webhook_url NOT LIKE '%172.17.%'
  AND webhook_url NOT LIKE '%172.18.%'
  AND webhook_url NOT LIKE '%172.19.%'
  AND webhook_url NOT LIKE '%172.2_.%'
  AND webhook_url NOT LIKE '%172.30.%'
  AND webhook_url NOT LIKE '%172.31.%'
  AND webhook_url NOT LIKE '%192.168.%'
  AND webhook_url NOT LIKE '%0.0.0.0%'
);

-- Create vault bucket for encrypted keys (if not exists)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('encrypted-keys', 'encrypted-keys', false)
ON CONFLICT (id) DO NOTHING;

-- Add RLS policy for encrypted-keys bucket
CREATE POLICY "Admins can access encrypted keys" ON storage.objects
FOR ALL USING (
  bucket_id = 'encrypted-keys' 
  AND auth.uid() IS NOT NULL
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Add column to track if API key is encrypted
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS api_key_encrypted BOOLEAN DEFAULT false;

-- Add comment explaining security approach
COMMENT ON COLUMN public.whatsapp_instances.api_key IS 'API key - should be encrypted at application level. Use Supabase Vault for production deployments.';
COMMENT ON COLUMN public.whatsapp_instances.api_key_encrypted IS 'Indicates if api_key is stored encrypted';