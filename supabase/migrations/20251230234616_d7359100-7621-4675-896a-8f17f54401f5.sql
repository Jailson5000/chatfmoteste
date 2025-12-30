-- Drop the existing constraint
ALTER TABLE public.automations DROP CONSTRAINT IF EXISTS webhook_url_https_only;

-- Recreate the constraint allowing empty strings (initial state for cloned templates)
ALTER TABLE public.automations 
ADD CONSTRAINT webhook_url_https_only 
CHECK (
  webhook_url = '' OR (
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
  )
);

COMMENT ON CONSTRAINT webhook_url_https_only ON public.automations IS 'Validates webhook URLs are HTTPS and not pointing to private networks. Empty strings are allowed for initial template clones.';