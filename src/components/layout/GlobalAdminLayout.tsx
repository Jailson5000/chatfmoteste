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
  Shield,
  Menu,
  X
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
  DropdownMenuSeparator,
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

const adminNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/global-admin", roles: ["super_admin", "admin_operacional", "admin_financeiro"] },
  { icon: Building2, label: "Empresas", path: "/global-admin/companies", roles: ["super_admin", "admin_operacional", "admin_financeiro"] },
  { icon: Link2, label: "Conexões", path: "/global-admin/connections", roles: ["super_admin", "admin_operacional"] },
  { icon: CreditCard, label: "Planos", path: "/global-admin/plans", roles: ["super_admin", "admin_financeiro"] },
  { icon: Users, label: "Usuários Admin", path: "/global-admin/users", roles: ["super_admin"] },
  { icon: Activity, label: "Monitoramento", path: "/global-admin/monitoring", roles: ["super_admin", "admin_operacional"] },
  { icon: Settings, label: "Configurações", path: "/global-admin/settings", roles: ["super_admin"] },
  { icon: Workflow, label: "N8N Settings", path: "/global-admin/n8n-settings", roles: ["super_admin", "admin_operacional"] },
];

const roleLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  super_admin: { label: "Super Admin", variant: "destructive" },
  admin_operacional: { label: "Admin Operacional", variant: "default" },
  admin_financeiro: { label: "Admin Financeiro", variant: "secondary" },
};

const breadcrumbMap: Record<string, string> = {
  "global-admin": "Dashboard",
  companies: "Empresas",
  connections: "Conexões",
  plans: "Planos",
  users: "Usuários Admin",
  monitoring: "Monitoramento",
  settings: "Configurações",
  "n8n-settings": "N8N Settings",
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

  const filteredNavItems = adminNavItems.filter(
    (item) => adminRole && item.roles.includes(adminRole)
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-card flex flex-col transition-transform duration-300 md:relative md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <span className="font-bold text-lg">MiauChat</span>
              <p className="text-xs text-muted-foreground">Painel Global</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 p-4">
          <nav className="space-y-1">
            {filteredNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/global-admin"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </ScrollArea>

        {/* User Info */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={adminProfile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary">
                {adminProfile?.full_name?.charAt(0) || "A"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{adminProfile?.full_name || "Admin"}</p>
              {adminRole && (
                <Badge variant={roleLabels[adminRole]?.variant || "outline"} className="text-xs">
                  {roleLabels[adminRole]?.label || adminRole}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-destructive hover:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-full items-center justify-between px-4 md:px-6">
            {/* Breadcrumbs */}
            <Breadcrumb className="hidden md:flex">
              <BreadcrumbList>
                {breadcrumbs.map((crumb, index) => (
                  <BreadcrumbItem key={crumb.path}>
                    {crumb.isLast ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <>
                        <BreadcrumbLink asChild>
                          <NavLink to={crumb.path}>{crumb.label}</NavLink>
                        </BreadcrumbLink>
                        <BreadcrumbSeparator>
                          <ChevronRight className="h-4 w-4" />
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
              {/* Theme Toggle */}
              <Button variant="ghost" size="icon" onClick={toggleTheme}>
                {theme === "dark" ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </Button>

              {/* Notifications */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <div className="flex items-center justify-between p-2 border-b">
                    <span className="font-semibold">Notificações</span>
                    {unreadCount > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => markAllAsRead.mutate()}
                      >
                        Marcar todas como lidas
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="h-[300px]">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">
                        Nenhuma notificação
                      </div>
                    ) : (
                      notifications.slice(0, 10).map((notification) => (
                        <DropdownMenuItem 
                          key={notification.id}
                          className={cn(
                            "flex flex-col items-start p-3 cursor-pointer",
                            !notification.is_read && "bg-muted/50"
                          )}
                          onClick={() => markAsRead.mutate(notification.id)}
                        >
                          <span className="font-medium">{notification.title}</span>
                          <span className="text-sm text-muted-foreground line-clamp-2">
                            {notification.message}
                          </span>
                          <span className="text-xs text-muted-foreground mt-1">
                            {new Date(notification.created_at).toLocaleDateString("pt-BR")}
                          </span>
                        </DropdownMenuItem>
                      ))
                    )}
                  </ScrollArea>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Role Badge (desktop) */}
              {adminRole && (
                <Badge 
                  variant={roleLabels[adminRole]?.variant || "outline"} 
                  className="hidden md:flex"
                >
                  {roleLabels[adminRole]?.label || adminRole}
                </Badge>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
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
