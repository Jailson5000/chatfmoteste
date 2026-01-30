import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyApproval } from "@/hooks/useCompanyApproval";
import { useTenant } from "@/hooks/useTenant";
import PendingApproval from "@/pages/PendingApproval";
import CompanyBlocked from "@/pages/CompanyBlocked";
import TenantMismatch from "@/pages/TenantMismatch";
import TrialExpired from "@/pages/TrialExpired";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute - Guards authenticated routes with multiple layers of protection
 * 
 * Security checks (in order):
 * 1. Authentication - Must be logged in
 * 2. Company approval status - Company must be approved
 * 3. Trial expiration - Trial must not be expired
 * 4. Tenant subdomain validation - User must access via their company's subdomain
 * 5. Password change requirement - Must change password if flagged
 * 
 * CRITICAL: Each client can ONLY access their own subdomain.
 * Access to other subdomains is blocked.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, mustChangePassword } = useAuth();
  const { approval_status, rejection_reason, company_subdomain, trial_type, trial_ends_at, trial_expired, plan_name, loading: approvalLoading } = useCompanyApproval();
  const { subdomain: currentSubdomain, isMainDomain, isLoading: tenantLoading } = useTenant();
  const [isRedirectingImpersonation, setIsRedirectingImpersonation] = useState(false);

  // IMPERSONATION CROSS-DOMAIN FIX: Detect when impersonation lands on wrong domain
  // and redirect to correct subdomain before TenantMismatch blocks access
  useEffect(() => {
    if (user && company_subdomain && isMainDomain && !isRedirectingImpersonation) {
      const searchParams = new URLSearchParams(window.location.search);
      const isImpersonating = searchParams.get('impersonating') === 'true';
      
      if (isImpersonating) {
        // User authenticated via impersonation but landed on main domain
        // Supabase Auth may have ignored redirect_to if subdomain not in allowed list
        // Redirect manually to correct tenant subdomain
        setIsRedirectingImpersonation(true);
        const correctUrl = `https://${company_subdomain}.miauchat.com.br${window.location.pathname}${window.location.search}`;
        console.log('[ProtectedRoute] Impersonation redirect to correct subdomain:', correctUrl);
        window.location.href = correctUrl;
      }
    }
  }, [user, company_subdomain, isMainDomain, isRedirectingImpersonation]);

  // Show loading while checking auth or redirecting impersonation
  if (loading || isRedirectingImpersonation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">
            {isRedirectingImpersonation ? "Redirecionando para sua plataforma..." : "Carregando..."}
          </p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Show loading while checking company approval status and tenant
  if (approvalLoading || tenantLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Verificando acesso...</p>
        </div>
      </div>
    );
  }

  // BLOCK: Company pending approval
  if (approval_status === 'pending_approval') {
    return <PendingApproval />;
  }

  // BLOCK: Company rejected
  if (approval_status === 'rejected') {
    return <CompanyBlocked reason={rejection_reason || undefined} />;
  }

  // BLOCK: Trial expired
  if (trial_type && trial_type !== 'none' && trial_expired) {
    console.log('[ProtectedRoute] Blocking: Trial expired at', trial_ends_at);
    return <TrialExpired trialEndsAt={trial_ends_at || undefined} planName={plan_name || undefined} />;
  }

  // ========================================
  // TENANT SUBDOMAIN VALIDATION
  // ========================================
  // CRITICAL: Each client can ONLY access via their own subdomain
  // 
  // Rules:
  // - If user has a company_subdomain, they MUST access via that subdomain
  // - Accessing main domain or wrong subdomain = blocked
  // - Exception: Users without company_subdomain (e.g., legacy users) can access main domain
  //
  if (company_subdomain) {
    // User has a specific subdomain - validate access
    
    // Block if accessing from main domain (must use subdomain)
    if (isMainDomain) {
      console.log('[ProtectedRoute] Blocking: User must access via subdomain', company_subdomain);
      return <TenantMismatch expectedSubdomain={company_subdomain} currentSubdomain={null} />;
    }
    
    // Block if accessing from wrong subdomain
    if (currentSubdomain && currentSubdomain !== company_subdomain) {
      console.log('[ProtectedRoute] Blocking: Wrong subdomain. Expected:', company_subdomain, 'Current:', currentSubdomain);
      return <TenantMismatch expectedSubdomain={company_subdomain} currentSubdomain={currentSubdomain} />;
    }
  }

  // Redirect to change password if flag is set
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  // ALLOW: All security checks passed
  return <>{children}</>;
}
