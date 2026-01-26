import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  MessageSquare,
  Kanban,
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
  Link2,
  Bot,
  BookOpen,
  Volume2,
  PlayCircle,
  CalendarDays,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useUserRole } from "@/hooks/useUserRole";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
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
import miauchatLogo from "@/assets/miauchat-logo.png";

const mainMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
];

const atendimentoItems = [
  { icon: MessageSquare, label: "Conversas", path: "/conversations" },
  { icon: Kanban, label: "Kanban", path: "/kanban" },
  { icon: Users, label: "Contatos", path: "/contacts" },
];

// Items that require admin/non-attendant access
const adminOnlyItems = [
  { icon: Link2, label: "Conexões", path: "/connections" },
];

// AI submenu items (admin only)
const aiItems = [
  { icon: Bot, label: "Agentes de IA", path: "/ai-agents" },
  { icon: BookOpen, label: "Base de Conhecimento", path: "/knowledge-base" },
  { icon: Volume2, label: "Voz IA", path: "/ai-voice" },
];

const settingsItem = { icon: Settings, label: "Configurações", path: "/settings" };
const profileItem = { icon: User, label: "Meu Perfil", path: "/profile" };
const agendaItem = { icon: CalendarDays, label: "Agenda", path: "/agenda" };
const agendaProItem = { icon: CalendarDays, label: "Agenda Pro", path: "/agenda-pro" };
const supportItem = { icon: HelpCircle, label: "Suporte", path: "/suporte" };
const tutorialsItem = { icon: PlayCircle, label: "Tutoriais", path: "/tutoriais" };

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [atendimentoOpen, setAtendimentoOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const { lawFirm } = useLawFirm();
  const { isAttendant } = useUserRole();
  const {
    integration: googleCalendarIntegration,
    isConnected: isGoogleCalendarConnected,
  } = useGoogleCalendar();

  const showAgenda = isGoogleCalendarConnected && !!googleCalendarIntegration?.is_active;

  // Build bottom menu items based on user role (profileItem is in Footer already)
  // Order: Agenda Pro, Agenda, Conexões, Configurações, Suporte
  // Note: tutorialsItem temporarily disabled until videos are recorded
  const bottomMenuItems = isAttendant
    ? showAgenda
      ? [agendaProItem, agendaItem, settingsItem, supportItem]
      : [agendaProItem, settingsItem, supportItem]
    : showAgenda
      ? [agendaProItem, agendaItem, ...adminOnlyItems, settingsItem, supportItem]
      : [agendaProItem, ...adminOnlyItems, settingsItem, supportItem];

  // Open sections if on one of their pages
  useEffect(() => {
    const isAtendimentoPage = atendimentoItems.some(item => location.pathname === item.path);
    if (isAtendimentoPage) {
      setAtendimentoOpen(true);
    }
    const isAiPage = aiItems.some(item => location.pathname === item.path);
    if (isAiPage) {
      setAiOpen(true);
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
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-200",
              "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive && "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg",
              isNested && !collapsed && "ml-3"
            )}
          >
            <item.icon className={cn("h-4 w-4 flex-shrink-0")} />
            {!collapsed && (
              <span className="text-[13px] font-medium truncate">{item.label}</span>
            )}
          </NavLink>
        </TooltipTrigger>
        {collapsed && (
          <TooltipContent side="right" className="text-xs font-medium">
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
          collapsed ? "w-14" : "w-56"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!collapsed && (
            <div className="flex items-center gap-2">
              <img 
                src={miauchatLogo} 
                alt="MiauChat" 
                className="w-14 h-14 rounded-lg object-contain"
              />
              <span className="font-bold text-base text-sidebar-foreground tracking-wide uppercase">
                MiauChat
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
                    "flex items-center justify-between w-full px-2.5 py-2 rounded-lg transition-all duration-200",
                    "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <MessageSquare className="h-4 w-4 flex-shrink-0" />
                    <span className="text-[13px] font-medium">Atendimentos</span>
                  </div>
                  {atendimentoOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5 mt-0.5">
                {atendimentoItems.map((item) => renderMenuItem(item, true))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* AI Section (admin only) */}
          {!isAttendant && (
            collapsed ? (
              aiItems.map((item) => renderMenuItem(item))
            ) : (
              <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center justify-between w-full px-2.5 py-2 rounded-lg transition-all duration-200",
                      "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Bot className="h-4 w-4 flex-shrink-0" />
                      <span className="text-[13px] font-medium">IA</span>
                    </div>
                    {aiOpen ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-0.5 mt-0.5">
                  {aiItems.map((item) => renderMenuItem(item, true))}
                </CollapsibleContent>
              </Collapsible>
            )
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
