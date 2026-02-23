import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyApproval } from "@/hooks/useCompanyApproval";
import { useTenant } from "@/hooks/useTenant";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import PendingApproval from "@/pages/PendingApproval";
import CompanyBlocked from "@/pages/CompanyBlocked";
import TenantMismatch from "@/pages/TenantMismatch";
import TrialExpired from "@/pages/TrialExpired";
import CompanySuspended from "@/pages/CompanySuspended";
import MaintenancePage from "@/pages/MaintenancePage";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute - Guards authenticated routes with multiple layers of protection
 * 
 * Security checks (in order):
 * 1. Authentication - Must be logged in
 * 2. Company approval status - Company must be approved
 * 3. Company suspension status - Company must not be suspended
 * 4. Trial expiration - Trial must not be expired
 * 5. Tenant subdomain validation - User must access via their company's subdomain
 * 6. Password change requirement - Must change password if flagged
 * 
 * CRITICAL: Each client can ONLY access their own subdomain.
 * Access to other subdomains is blocked.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, mustChangePassword } = useAuth();
  const [showRetry, setShowRetry] = useState(false);
  const { isMaintenanceMode } = useMaintenanceMode();
  const { 
    approval_status, 
    rejection_reason, 
    company_subdomain, 
    trial_type, 
    trial_ends_at, 
    trial_expired, 
    plan_name,
    plan_price,
    company_status,
    suspended_reason,
    loading: approvalLoading 
  } = useCompanyApproval();
  const { subdomain: currentSubdomain, isMainDomain, isLoading: tenantLoading } = useTenant();

  // Check if user is a global admin (to bypass maintenance mode)
  const { data: isGlobalAdmin } = useQuery({
    queryKey: ["is-global-admin", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data } = await supabase.rpc("is_admin", { _user_id: user.id });
      return data === true;
    },
    enabled: !!user?.id && isMaintenanceMode,
    staleTime: 60000,
  });

  // Timer to show retry button after 10s of loading
  useEffect(() => {
    if (approvalLoading || tenantLoading) {
      setShowRetry(false);
      const timer = setTimeout(() => setShowRetry(true), 10000);
      return () => clearTimeout(timer);
    } else {
      setShowRetry(false);
    }
  }, [approvalLoading, tenantLoading]);

  // Timer to show retry button after 10s of loading
  useEffect(() => {
    if (approvalLoading || tenantLoading) {
      setShowRetry(false);
      const timer = setTimeout(() => setShowRetry(true), 10000);
      return () => clearTimeout(timer);
    } else {
      setShowRetry(false);
    }
  }, [approvalLoading, tenantLoading]);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // BLOCK: Maintenance mode active (global admins bypass)
  if (isMaintenanceMode && !isGlobalAdmin) {
    console.log('[ProtectedRoute] Blocking: System in maintenance mode');
    return <MaintenancePage />;
  }

  // Show loading while checking company approval status and tenant
  if (approvalLoading || tenantLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Verificando acesso...</p>
          {showRetry && (
            <div className="flex flex-col items-center gap-2 mt-2">
              <p className="text-sm text-muted-foreground">
                O servidor está demorando mais que o normal...
              </p>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Tentar novamente
              </Button>
            </div>
          )}
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

  // BLOCK: Company suspended for non-payment
  if (company_status === 'suspended') {
    console.log('[ProtectedRoute] Blocking: Company suspended for non-payment');
    return <CompanySuspended reason={suspended_reason} planName={plan_name} planPrice={plan_price} />;
  }

  // BLOCK: Trial expired (only if company is not yet active/paid)
  if (trial_type && trial_type !== 'none' && trial_expired && company_status !== 'active') {
    console.log('[ProtectedRoute] Blocking: Trial expired at', trial_ends_at, 'and status is:', company_status);
    return <TrialExpired trialEndsAt={trial_ends_at || undefined} planName={plan_name || undefined} planPrice={plan_price ?? undefined} />;
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
