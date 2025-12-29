import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyApproval } from "@/hooks/useCompanyApproval";
import PendingApproval from "@/pages/PendingApproval";
import CompanyBlocked from "@/pages/CompanyBlocked";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, mustChangePassword } = useAuth();
  const { approval_status, rejection_reason, loading: approvalLoading } = useCompanyApproval();

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

  // Show loading while checking company approval status
  if (approvalLoading) {
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

  // Redirect to change password if flag is set
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  // ALLOW: Company approved or status not applicable
  return <>{children}</>;
}
