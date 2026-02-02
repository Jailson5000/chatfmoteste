-- Add cancelled_at column to company_subscriptions for Stripe webhook support
ALTER TABLE company_subscriptions 
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;