import { Navigate } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import type { AdminRole } from "@/hooks/useAdminAuth";

interface GlobalAdminRouteProps {
  children: React.ReactNode;
  allowedRoles?: AdminRole[];
}

export function GlobalAdminRoute({ 
  children, 
  allowedRoles = ["super_admin", "admin_operacional", "admin_financeiro"] 
}: GlobalAdminRouteProps) {
  const { user, adminRole, loading, isAdmin } = useAdminAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/global-admin/auth" replace />;
  }

  if (adminRole && !allowedRoles.includes(adminRole)) {
    return <Navigate to="/global-admin" replace />;
  }

  return <>{children}</>;
}
