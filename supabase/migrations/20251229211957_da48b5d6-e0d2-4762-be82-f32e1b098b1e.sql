-- Add approval_status column to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';

-- Add constraint to validate approval_status values
ALTER TABLE public.companies 
ADD CONSTRAINT companies_approval_status_check 
CHECK (approval_status IN ('pending_approval', 'approved', 'rejected'));

-- Add rejection_reason column for tracking why a company was rejected
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Add approval metadata columns
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS approved_by uuid,
ADD COLUMN IF NOT EXISTS rejected_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rejected_by uuid;

-- Create index for filtering pending companies
CREATE INDEX IF NOT EXISTS idx_companies_approval_status ON public.companies(approval_status);

-- Comment on columns
COMMENT ON COLUMN public.companies.approval_status IS 'Approval status: pending_approval, approved, rejected';
COMMENT ON COLUMN public.companies.rejection_reason IS 'Reason for rejection if company was rejected';
COMMENT ON COLUMN public.companies.approved_at IS 'Timestamp when company was approved';
COMMENT ON COLUMN public.companies.approved_by IS 'Admin user who approved the company';
COMMENT ON COLUMN public.companies.rejected_at IS 'Timestamp when company was rejected';
COMMENT ON COLUMN public.companies.rejected_by IS 'Admin user who rejected the company';