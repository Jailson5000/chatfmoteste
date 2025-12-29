import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  Settings, 
  ArrowLeft,
  Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLawFirm } from "@/hooks/useLawFirm";

const adminNavItems = [
  { icon: LayoutDashboard, label: "Visão Geral", path: "/admin" },
  { icon: Users, label: "Equipe", path: "/admin/team" },
  { icon: Building2, label: "Empresa", path: "/admin/company" },
  { icon: Settings, label: "Configurações", path: "/admin/settings" },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const { lawFirm } = useLawFirm();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">Painel Admin</span>
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {lawFirm?.name || "Carregando..."}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {adminNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/admin"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao App
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
