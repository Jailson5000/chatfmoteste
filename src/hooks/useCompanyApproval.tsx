import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface CompanyApprovalStatus {
  approval_status: 'pending_approval' | 'approved' | 'rejected' | null;
  rejection_reason: string | null;
  company_name: string | null;
  company_subdomain: string | null;
  // Trial fields
  trial_type: 'none' | 'auto_plan' | 'manual' | null;
  trial_ends_at: string | null;
  trial_expired: boolean;
  plan_name: string | null;
  plan_price: number | null;
  // Suspension fields
  company_status: 'active' | 'trial' | 'suspended' | 'cancelled' | null;
  suspended_reason: string | null;
  loading: boolean;
}

/**
 * Hook to check company approval status and subdomain for the current user
 * 
 * Returns the approval status and subdomain of the company associated with the user's law_firm.
 * Used to:
 * - Block access for pending_approval or rejected companies
 * - Validate that user is accessing via their correct subdomain
 * - Block access when trial has expired
 * - Block access when company is suspended for non-payment
 */
export function useCompanyApproval(): CompanyApprovalStatus {
  const { user } = useAuth();
  const [status, setStatus] = useState<CompanyApprovalStatus>({
    approval_status: null,
    rejection_reason: null,
    company_name: null,
    company_subdomain: null,
    trial_type: null,
    trial_ends_at: null,
    trial_expired: false,
    plan_name: null,
    plan_price: null,
    company_status: null,
    suspended_reason: null,
    loading: true,
  });

  useEffect(() => {
    if (!user) {
      setStatus({
        approval_status: null,
        rejection_reason: null,
        company_name: null,
        company_subdomain: null,
        trial_type: null,
        trial_ends_at: null,
        trial_expired: false,
        plan_name: null,
        plan_price: null,
        company_status: null,
        suspended_reason: null,
        loading: false,
      });
      return;
    }

    const fetchApprovalStatus = async () => {
      try {
        // First get user's law_firm_id from profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('law_firm_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError || !profile?.law_firm_id) {
          console.log('[useCompanyApproval] No law_firm_id found for user');
          // SECURITY: Block users without a valid law_firm_id
          // Only global admins (checked separately) should be allowed without law_firm
          setStatus({
            approval_status: 'rejected', // BLOCK access - no valid company
            rejection_reason: 'Usuário não está vinculado a nenhuma empresa válida.',
            company_name: null,
            company_subdomain: null,
            trial_type: null,
            trial_ends_at: null,
            trial_expired: false,
            plan_name: null,
            plan_price: null,
            company_status: null,
            suspended_reason: null,
            loading: false,
          });
          return;
        }

        // Get company status, trial info, suspension info, and law_firm subdomain
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select(`
            approval_status, 
            rejection_reason, 
            name,
            status,
            suspended_reason,
            trial_type,
            trial_ends_at,
            law_firm:law_firms(subdomain),
            plan:plans!companies_plan_id_fkey(name, price)
          `)
          .eq('law_firm_id', profile.law_firm_id)
          .maybeSingle();

        if (companyError || !company) {
          console.log('[useCompanyApproval] No company found for law_firm_id:', profile.law_firm_id);
          // SECURITY: Block users without a valid company record
          // All users MUST have a company record to access the system
          setStatus({
            approval_status: 'rejected', // BLOCK access - no valid company
            rejection_reason: 'Sua empresa não está cadastrada no sistema. Entre em contato com o suporte.',
            company_name: null,
            company_subdomain: null,
            trial_type: null,
            trial_ends_at: null,
            trial_expired: false,
            plan_name: null,
            plan_price: null,
            company_status: null,
            suspended_reason: null,
            loading: false,
          });
          return;
        }

        // Extract subdomain from law_firm relation
        const subdomain = (company.law_firm as any)?.subdomain || null;
        const planName = (company.plan as any)?.name || null;
        const planPrice = (company.plan as any)?.price || null;
        
        // Check if trial has expired
        const trialType = company.trial_type as 'none' | 'auto_plan' | 'manual' | null;
        const trialEndsAt = company.trial_ends_at;
        let trialExpired = false;
        
        if (trialType && trialType !== 'none' && trialEndsAt) {
          trialExpired = new Date() > new Date(trialEndsAt);
        }

        // Extract company status and suspension info
        const companyStatus = company.status as 'active' | 'trial' | 'suspended' | 'cancelled' | null;
        const suspendedReason = company.suspended_reason || null;

        console.log('[useCompanyApproval] Company status:', company.approval_status, 'Status:', companyStatus, 'Subdomain:', subdomain, 'Trial:', trialType, 'Expired:', trialExpired);
        
        setStatus({
          approval_status: company.approval_status as 'pending_approval' | 'approved' | 'rejected',
          rejection_reason: company.rejection_reason,
          company_name: company.name,
          company_subdomain: subdomain,
          trial_type: trialType,
          trial_ends_at: trialEndsAt,
          trial_expired: trialExpired,
          plan_name: planName,
          plan_price: planPrice,
          company_status: companyStatus,
          suspended_reason: suspendedReason,
          loading: false,
        });
      } catch (err) {
        console.error('[useCompanyApproval] Error:', err);
        // SECURITY: Block access on any error - fail secure
        setStatus({
          approval_status: 'rejected', // BLOCK access on error
          rejection_reason: 'Erro ao verificar acesso. Tente novamente ou contate o suporte.',
          company_name: null,
          company_subdomain: null,
          trial_type: null,
          trial_ends_at: null,
          trial_expired: false,
          plan_name: null,
          plan_price: null,
          company_status: null,
          suspended_reason: null,
          loading: false,
        });
      }
    };

    fetchApprovalStatus();
  }, [user]);

  return status;
}
