-- Add UNIQUE constraint to company_subscriptions.company_id for proper upsert behavior
-- First, check if there are any duplicates and keep only the most recent one
DELETE FROM company_subscriptions a
USING company_subscriptions b
WHERE a.company_id = b.company_id
  AND a.created_at < b.created_at;

-- Now add the unique constraint
ALTER TABLE company_subscriptions 
ADD CONSTRAINT company_subscriptions_company_id_unique UNIQUE (company_id);