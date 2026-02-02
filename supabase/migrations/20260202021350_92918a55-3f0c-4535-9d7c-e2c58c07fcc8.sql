-- Fix billing_type constraint to accept more values
ALTER TABLE company_subscriptions 
DROP CONSTRAINT IF EXISTS company_subscriptions_billing_type_check;

ALTER TABLE company_subscriptions 
ADD CONSTRAINT company_subscriptions_billing_type_check 
CHECK (billing_type IN ('monthly', 'yearly', 'stripe', 'asaas', 'trialing'));