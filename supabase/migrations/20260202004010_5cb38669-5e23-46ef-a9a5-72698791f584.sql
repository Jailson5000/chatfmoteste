-- Add Stripe columns to company_subscriptions table
ALTER TABLE public.company_subscriptions
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_stripe_customer_id 
ON public.company_subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_stripe_subscription_id 
ON public.company_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.company_subscriptions.stripe_customer_id IS 'Stripe Customer ID (cus_xxx)';
COMMENT ON COLUMN public.company_subscriptions.stripe_subscription_id IS 'Stripe Subscription ID (sub_xxx)';