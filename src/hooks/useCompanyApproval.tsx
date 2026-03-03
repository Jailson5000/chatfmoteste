import { useEffect, useState, useCallback, useRef } from "react";
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
  // Refetch function
  refetch: () => void;
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
 *
 * Auto-polls every 30s when company is suspended to detect when access is restored.
 */
export function useCompanyApproval(): CompanyApprovalStatus {
  const { user } = useAuth();
  // Use stable user.id as dependency instead of user object to prevent
  // re-triggering on tab focus (Supabase fires SIGNED_IN with new object reference)
  const userId = user?.id ?? null;
  const [refreshTrigger, setRefreshTrigger] = useState(0);
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
    refetch: () => {},
  });

  // Ref to track last user ID we fetched for (prevents flash of error page on F5)
  const lastFetchedUserIdRef = useRef<string | null>(null);

  const refetch = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (!userId) {
      lastFetchedUserIdRef.current = null;
      setStatus(prev => ({
        ...prev,
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
      }));
      return;
    }

    // Set loading immediately to prevent flash of error page during F5 refresh
    setStatus(prev => ({ ...prev, loading: true }));

    let retryTimeout: NodeJS.Timeout | null = null;
    let cancelled = false;

    const fetchWithTimeout = <T,>(promiseLike: PromiseLike<T>, timeoutMs = 15000): Promise<T> => {
      return Promise.race([
        Promise.resolve(promiseLike),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
        )
      ]);
    };

    // Show transient error UI (after retry exhausted)
    const showTransientError = () => {
      setStatus(prev => ({
        ...prev,
        approval_status: null,
        rejection_reason: null,
        loading: false,
      }));
      lastFetchedUserIdRef.current = userId;
    };

    const fetchApprovalStatus = async (isRetry = false) => {
      if (cancelled) return;

      try {
        // First get user's law_firm_id from profile
        const { data: profile, error: profileError } = await fetchWithTimeout(
          supabase
            .from('profiles')
            .select('law_firm_id')
            .eq('id', userId)
            .maybeSingle()
        );

        if (cancelled) return;

        if (profileError) {
          console.error('[useCompanyApproval] Profile query error:', profileError.message);
          if (!isRetry) {
            console.warn('[useCompanyApproval] Will retry in 3s...');
            retryTimeout = setTimeout(() => { if (!cancelled) fetchApprovalStatus(true); }, 3000);
            return;
          }
          showTransientError();
          return;
        }
        if (!profile?.law_firm_id) {
          console.log('[useCompanyApproval] No law_firm_id found for user');
          // SECURITY: Block users without a valid law_firm_id
          // Only global admins (checked separately) should be allowed without law_firm
          setStatus(prev => ({
            ...prev,
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
          }));
          lastFetchedUserIdRef.current = userId;
          return;
        }

        // Get company status, trial info, suspension info, and law_firm subdomain
        const { data: company, error: companyError } = await fetchWithTimeout(
          supabase
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
            .maybeSingle()
        );

        if (cancelled) return;

        if (companyError) {
          console.error('[useCompanyApproval] Company query error:', companyError.message);
          if (!isRetry) {
            console.warn('[useCompanyApproval] Will retry in 3s...');
            retryTimeout = setTimeout(() => { if (!cancelled) fetchApprovalStatus(true); }, 3000);
            return;
          }
          showTransientError();
          return;
        }
        if (!company) {
          console.log('[useCompanyApproval] No company found for law_firm_id:', profile.law_firm_id);
          // SECURITY: Block users without a valid company record
          // All users MUST have a company record to access the system
          setStatus(prev => ({
            ...prev,
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
          }));
          lastFetchedUserIdRef.current = userId;
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

        setStatus(prev => ({
          ...prev,
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
        }));
        lastFetchedUserIdRef.current = userId;
      } catch (err: any) {
        if (cancelled) return;
        console.error('[useCompanyApproval] Error:', err);
        if (!isRetry) {
          console.warn('[useCompanyApproval] Transient error - retrying in 3s...');
          retryTimeout = setTimeout(() => { if (!cancelled) fetchApprovalStatus(true); }, 3000);
          return;
        }
        console.warn('[useCompanyApproval] Retry also failed - showing error UI');
        showTransientError();
      }
    };

    fetchApprovalStatus();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [userId, refreshTrigger]);

  // Auto-poll when company is suspended to detect when access is restored
  useEffect(() => {
    if (status.company_status === 'suspended') {
      const interval = setInterval(() => {
        console.log('[useCompanyApproval] Polling for status change (suspended company)');
        refetch();
      }, 30000); // Every 30 seconds

      return () => clearInterval(interval);
    }
  }, [status.company_status, refetch]);

  // Derive effective loading: also true if user changed but effect hasn't run yet (prevents flash)
  const effectiveLoading = status.loading || (userId != null && userId !== lastFetchedUserIdRef.current);

  return { ...status, loading: effectiveLoading, refetch };
}
