import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  MessageSquare,
  Kanban,
  Zap,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Moon,
  Sun,
  User,
  Users,
  ChevronDown,
  ChevronUp,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const mainMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
];

const atendimentoItems = [
  { icon: MessageSquare, label: "Conversas", path: "/conversations" },
  { icon: Kanban, label: "Kanban", path: "/kanban" },
  { icon: Users, label: "Contatos", path: "/contacts" },
];

const bottomMenuItems = [
  { icon: Zap, label: "Automações", path: "/automations" },
  { icon: Settings, label: "Configurações", path: "/settings" },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [atendimentoOpen, setAtendimentoOpen] = useState(true);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const { lawFirm } = useLawFirm();

  // Open atendimento section if on one of its pages
  useEffect(() => {
    const isAtendimentoPage = atendimentoItems.some(item => location.pathname === item.path);
    if (isAtendimentoPage) {
      setAtendimentoOpen(true);
    }
  }, [location.pathname]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Erro ao sair",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const renderMenuItem = (item: { icon: any; label: string; path: string }, isNested = false) => {
    const isActive = location.pathname === item.path;
    return (
      <Tooltip key={item.path}>
        <TooltipTrigger asChild>
          <NavLink
            to={item.path}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
              "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive && "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg",
              isNested && !collapsed && "ml-4"
            )}
          >
            <item.icon className={cn("h-5 w-5 flex-shrink-0")} />
            {!collapsed && (
              <span className="font-medium truncate">{item.label}</span>
            )}
          </NavLink>
        </TooltipTrigger>
        {collapsed && (
          <TooltipContent side="right" className="font-medium">
            {item.label}
          </TooltipContent>
        )}
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
          {!collapsed && (
            <div className="flex items-center gap-2">
              {lawFirm?.logo_url ? (
                <img 
                  src={lawFirm.logo_url} 
                  alt="Logo" 
                  className="w-8 h-8 rounded-lg object-contain"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-sidebar-primary-foreground" />
                </div>
              )}
              <span className="font-display font-semibold text-sidebar-foreground truncate max-w-[140px]">
                {lawFirm?.name || "Minha Empresa"}
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {/* Main menu items */}
          {mainMenuItems.map((item) => renderMenuItem(item))}

          {/* Atendimentos section */}
          {collapsed ? (
            // When collapsed, show items individually
            atendimentoItems.map((item) => renderMenuItem(item))
          ) : (
            <Collapsible open={atendimentoOpen} onOpenChange={setAtendimentoOpen}>
              <CollapsibleTrigger asChild>
                <button
                  className={cn(
                    "flex items-center justify-between w-full px-3 py-2.5 rounded-lg transition-all duration-200",
                    "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 flex-shrink-0" />
                    <span className="font-medium">Atendimentos</span>
                  </div>
                  {atendimentoOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 mt-1">
                {atendimentoItems.map((item) => renderMenuItem(item, true))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Bottom menu items */}
          {bottomMenuItems.map((item) => renderMenuItem(item))}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-sidebar-border space-y-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className={cn(
                  "w-full justify-start gap-3 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent",
                  collapsed && "justify-center"
                )}
              >
                {theme === "dark" ? (
                  <Sun className="h-5 w-5 flex-shrink-0" />
                ) : (
                  <Moon className="h-5 w-5 flex-shrink-0" />
                )}
                {!collapsed && <span>Tema</span>}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">Alternar tema</TooltipContent>
            )}
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink
                to="/profile"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
                  collapsed && "justify-center"
                )}
              >
                <User className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>Perfil</span>}
              </NavLink>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">Perfil</TooltipContent>
            )}
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className={cn(
                  "w-full justify-start gap-3 text-sidebar-muted hover:text-destructive hover:bg-sidebar-accent",
                  collapsed && "justify-center"
                )}
              >
                <LogOut className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>Sair</span>}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">Sair</TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
