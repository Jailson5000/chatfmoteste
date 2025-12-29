import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Building2, 
  Link2, 
  CreditCard, 
  Users, 
  Activity,
  Settings,
  Workflow,
  LogOut,
  Bell,
  Moon,
  Sun,
  ChevronRight,
  Menu,
  X,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { useTheme } from "@/hooks/useTheme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import miauchatLogo from "@/assets/miauchat-logo.png";

const principalNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/global-admin", roles: ["super_admin", "admin_operacional", "admin_financeiro"] },
  { icon: Building2, label: "Empresas", path: "/global-admin/companies", roles: ["super_admin", "admin_operacional", "admin_financeiro"] },
  { icon: Link2, label: "Conexões", path: "/global-admin/connections", roles: ["super_admin", "admin_operacional"] },
  { icon: Workflow, label: "Configuração n8n", path: "/global-admin/n8n-settings", roles: ["super_admin", "admin_operacional"] },
  { icon: Activity, label: "Monitoramento", path: "/global-admin/monitoring", roles: ["super_admin", "admin_operacional"] },
];

const adminNavItems = [
  { icon: Users, label: "Usuários Admin", path: "/global-admin/users", roles: ["super_admin"] },
  { icon: CreditCard, label: "Planos", path: "/global-admin/plans", roles: ["super_admin", "admin_financeiro"] },
  { icon: FileText, label: "Logs de Auditoria", path: "/global-admin/audit-logs", roles: ["super_admin", "admin_operacional"] },
];

const roleLabels: Record<string, { label: string; color: string }> = {
  super_admin: { label: "Super Admin", color: "bg-red-600" },
  admin_operacional: { label: "Admin Operacional", color: "bg-blue-600" },
  admin_financeiro: { label: "Admin Financeiro", color: "bg-green-600" },
};

const breadcrumbMap: Record<string, string> = {
  "global-admin": "Admin",
  companies: "Empresas",
  connections: "Conexões",
  plans: "Planos",
  users: "Usuários Admin",
  monitoring: "Monitoramento",
  settings: "Configurações",
  "n8n-settings": "Configuração n8n",
  "audit-logs": "Logs de Auditoria",
};

export function GlobalAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { adminProfile, adminRole, signOut } = useAdminAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useAdminNotifications();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleSignOut = async () => {
    await signOut();
    navigate("/global-admin/auth");
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  // Generate breadcrumbs from path
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const breadcrumbs = pathSegments.map((segment, index) => ({
    label: breadcrumbMap[segment] || segment,
    path: "/" + pathSegments.slice(0, index + 1).join("/"),
    isLast: index === pathSegments.length - 1,
  }));

  const filteredPrincipalItems = principalNavItems.filter(
    (item) => adminRole && item.roles.includes(adminRole)
  );

  const filteredAdminItems = adminNavItems.filter(
    (item) => adminRole && item.roles.includes(adminRole)
  );

  return (
    <div className="flex min-h-screen bg-[#0a0a0a] text-white">
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden text-white hover:bg-white/10"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-[#0f0f0f] border-r border-white/[0.08] flex flex-col transition-transform duration-300 md:relative md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/20 rounded-xl blur-lg" />
              <img src={miauchatLogo} alt="MiauChat" className="relative h-10 w-10" />
            </div>
            <div>
              <span className="font-bold text-lg text-white">MiauChat</span>
              <p className="text-xs text-white/40">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-4">
          {/* Principal Section */}
          <div className="px-4 mb-2">
            <span className="text-xs font-medium text-white/40 uppercase tracking-wider">Principal</span>
          </div>
          <nav className="space-y-1 px-3">
            {filteredPrincipalItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/global-admin"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-red-600 text-white shadow-lg shadow-red-600/20"
                      : "text-white/60 hover:text-white hover:bg-white/[0.05]"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Admin Section */}
          {filteredAdminItems.length > 0 && (
            <>
              <div className="px-4 mt-6 mb-2">
                <span className="text-xs font-medium text-white/40 uppercase tracking-wider">Administração</span>
              </div>
              <nav className="space-y-1 px-3">
                {filteredAdminItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                        isActive
                          ? "bg-red-600 text-white shadow-lg shadow-red-600/20"
                          : "text-white/60 hover:text-white hover:bg-white/[0.05]"
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </>
          )}
        </ScrollArea>

        {/* User Info */}
        <div className="p-4 border-t border-white/[0.08]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.05] transition-colors">
                <Avatar className="h-10 w-10 border-2 border-red-500/30">
                  <AvatarImage src={adminProfile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-red-600/20 text-red-400">
                    {adminProfile?.full_name?.charAt(0) || "A"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-white truncate">{adminProfile?.full_name || "Admin"}</p>
                  {adminRole && (
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                      roleLabels[adminRole]?.color || "bg-gray-600",
                      "text-white"
                    )}>
                      {roleLabels[adminRole]?.label || adminRole}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-white/40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-[#1a1a1a] border-white/10">
              <DropdownMenuItem 
                onClick={handleSignOut}
                className="text-red-400 hover:text-red-300 focus:text-red-300 focus:bg-red-500/10"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 border-b border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur">
          <div className="flex h-full items-center justify-between px-4 md:px-6">
            {/* Breadcrumbs */}
            <Breadcrumb className="hidden md:flex">
              <BreadcrumbList>
                {breadcrumbs.map((crumb, index) => (
                  <BreadcrumbItem key={crumb.path}>
                    {crumb.isLast ? (
                      <BreadcrumbPage className="text-white">{crumb.label}</BreadcrumbPage>
                    ) : (
                      <>
                        <BreadcrumbLink asChild>
                          <NavLink to={crumb.path} className="text-white/50 hover:text-white">{crumb.label}</NavLink>
                        </BreadcrumbLink>
                        <BreadcrumbSeparator>
                          <ChevronRight className="h-4 w-4 text-white/30" />
                        </BreadcrumbSeparator>
                      </>
                    )}
                  </BreadcrumbItem>
                ))}
              </BreadcrumbList>
            </Breadcrumb>

            <div className="md:hidden" />

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              {/* Notifications */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative text-white/60 hover:text-white hover:bg-white/[0.05]">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 bg-[#1a1a1a] border-white/10">
                  <div className="flex items-center justify-between p-2 border-b border-white/10">
                    <span className="font-semibold text-white">Notificações</span>
                    {unreadCount > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs text-white/60 hover:text-white"
                        onClick={() => markAllAsRead.mutate()}
                      >
                        Marcar todas como lidas
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="h-[300px]">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-white/40">
                        Nenhuma notificação
                      </div>
                    ) : (
                      notifications.slice(0, 10).map((notification) => (
                        <DropdownMenuItem 
                          key={notification.id}
                          className={cn(
                            "flex flex-col items-start p-3 cursor-pointer text-white",
                            !notification.is_read && "bg-white/[0.03]"
                          )}
                          onClick={() => markAsRead.mutate(notification.id)}
                        >
                          <span className="font-medium">{notification.title}</span>
                          <span className="text-sm text-white/50 line-clamp-2">
                            {notification.message}
                          </span>
                          <span className="text-xs text-white/30 mt-1">
                            {new Date(notification.created_at).toLocaleDateString("pt-BR")}
                          </span>
                        </DropdownMenuItem>
                      ))
                    )}
                  </ScrollArea>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Theme Toggle */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={toggleTheme}
                className="text-white/60 hover:text-white hover:bg-white/[0.05]"
              >
                {theme === "dark" ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </Button>

              {/* Role Badge (desktop) */}
              {adminRole && (
                <span className={cn(
                  "hidden md:inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold",
                  roleLabels[adminRole]?.color || "bg-gray-600",
                  "text-white"
                )}>
                  {roleLabels[adminRole]?.label || adminRole}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6 bg-[#0a0a0a]">
          <Outlet />
        </main>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}