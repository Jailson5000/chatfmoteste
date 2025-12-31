import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface CompanyApprovalStatus {
  approval_status: 'pending_approval' | 'approved' | 'rejected' | null;
  rejection_reason: string | null;
  company_name: string | null;
  company_subdomain: string | null;
  loading: boolean;
}

/**
 * Hook to check company approval status and subdomain for the current user
 * 
 * Returns the approval status and subdomain of the company associated with the user's law_firm.
 * Used to:
 * - Block access for pending_approval or rejected companies
 * - Validate that user is accessing via their correct subdomain
 */
export function useCompanyApproval(): CompanyApprovalStatus {
  const { user } = useAuth();
  const [status, setStatus] = useState<CompanyApprovalStatus>({
    approval_status: null,
    rejection_reason: null,
    company_name: null,
    company_subdomain: null,
    loading: true,
  });

  useEffect(() => {
    if (!user) {
      setStatus({
        approval_status: null,
        rejection_reason: null,
        company_name: null,
        company_subdomain: null,
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
            loading: false,
          });
          return;
        }

        // Get company status and law_firm subdomain
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('approval_status, rejection_reason, name, law_firm:law_firms(subdomain)')
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
            loading: false,
          });
          return;
        }

        // Extract subdomain from law_firm relation
        const subdomain = (company.law_firm as any)?.subdomain || null;

        console.log('[useCompanyApproval] Company status:', company.approval_status, 'Subdomain:', subdomain);
        
        setStatus({
          approval_status: company.approval_status as 'pending_approval' | 'approved' | 'rejected',
          rejection_reason: company.rejection_reason,
          company_name: company.name,
          company_subdomain: subdomain,
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
          loading: false,
        });
      }
    };

    fetchApprovalStatus();
  }, [user]);

  return status;
}
