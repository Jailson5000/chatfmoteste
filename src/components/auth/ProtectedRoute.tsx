import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyApproval } from "@/hooks/useCompanyApproval";
import { useTenant } from "@/hooks/useTenant";
import PendingApproval from "@/pages/PendingApproval";
import CompanyBlocked from "@/pages/CompanyBlocked";
import TenantMismatch from "@/pages/TenantMismatch";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute - Guards authenticated routes with multiple layers of protection
 * 
 * Security checks (in order):
 * 1. Authentication - Must be logged in
 * 2. Company approval status - Company must be approved
 * 3. Tenant subdomain validation - User must access via their company's subdomain
 * 4. Password change requirement - Must change password if flagged
 * 
 * CRITICAL: Each client can ONLY access their own subdomain.
 * Access to other subdomains is blocked.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, mustChangePassword } = useAuth();
  const { approval_status, rejection_reason, company_subdomain, loading: approvalLoading } = useCompanyApproval();
  const { subdomain: currentSubdomain, isMainDomain, isLoading: tenantLoading } = useTenant();

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
