import { Navigate } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import type { AdminRole } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle } from "lucide-react";

interface GlobalAdminRouteProps {
  children: React.ReactNode;
  allowedRoles?: AdminRole[];
}

export function GlobalAdminRoute({ 
  children, 
  allowedRoles = ["super_admin", "admin_operacional", "admin_financeiro"] 
}: GlobalAdminRouteProps) {
  const { user, adminRole, loading, isAdmin, error } = useAdminAuth();

  // Exibir erro se timeout ou falha na verificação
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 max-w-md text-center p-6">
          <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">Erro ao verificar sessão</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button 
            onClick={() => window.location.reload()} 
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

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
