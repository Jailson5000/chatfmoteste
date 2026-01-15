import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Building2,
  Search,
  AlertTriangle,
  AlertCircle,
  Settings,
  Eye,
  Users,
  Wifi,
  Bot,
  MessageSquare,
  Mic,
  ChevronDown,
  ChevronUp,
  Loader2,
  Calendar,
  ArrowUpRight,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCompanies } from "@/hooks/useCompanies";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface CompanyUsage {
  company_id: string;
  company_name: string;
  plan_name: string | null;
  plan_id: string | null;
  law_firm_id: string;
  use_custom_limits: boolean;
  current_users: number;
  current_instances: number;
  current_agents: number;
  current_ai_conversations: number;
  current_tts_minutes: number;
  effective_max_users: number;
  effective_max_instances: number;
  effective_max_agents: number;
  effective_max_ai_conversations: number;
  effective_max_tts_minutes: number;
  effective_max_workspaces: number;
}

interface AgentWithConversations {
  id: string;
  name: string;
  is_active: boolean;
  conversations_count: number;
}

interface CompanyWithStatus extends CompanyUsage {
  status: string;
  created_at: string;
  subdomain: string | null;
  last_activity?: string;
  agents?: AgentWithConversations[];
}

type StatusFilter = "all" | "active" | "pending" | "suspended" | "blocked" | "cancelled";

// Helper to calculate percentage
const getPercentage = (current: number, max: number): number => {
  if (!max || max === 0) return 0;
  return Math.min(Math.round((current / max) * 100), 100);
};

// Helper to get alert level
const getAlertLevel = (percentage: number): "ok" | "warning" | "critical" => {
  if (percentage >= 100) return "critical";
  if (percentage >= 80) return "warning";
  return "ok";
};

// Progress bar with alert colors
function UsageProgress({ current, max, label }: { current: number; max: number; label: string }) {
  const percentage = getPercentage(current, max);
  const alertLevel = getAlertLevel(percentage);

  const colorClass = {
    ok: "bg-green-500",
    warning: "bg-yellow-500",
    critical: "bg-red-500",
  }[alertLevel];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="space-y-1 min-w-[100px]">
            <div className="flex justify-between text-xs text-white/60">
              <span>{label}</span>
              <span className={alertLevel !== "ok" ? `text-${alertLevel === "warning" ? "yellow" : "red"}-400 font-medium` : ""}>
                {current}/{max}
              </span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${colorClass}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-[#1a1a1a] border-white/10 text-white">
          <p>{percentage}% utilizado</p>
          {alertLevel === "warning" && <p className="text-yellow-400 text-xs">Próximo do limite!</p>}
          {alertLevel === "critical" && <p className="text-red-400 text-xs">Limite atingido!</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Alert badge for company row
function CompanyAlertBadge({ usage }: { usage: CompanyUsage }) {
  const metrics = [
    { current: usage.current_users, max: usage.effective_max_users },
    { current: usage.current_instances, max: usage.effective_max_instances },
    { current: usage.current_agents, max: usage.effective_max_agents },
    { current: usage.current_ai_conversations, max: usage.effective_max_ai_conversations },
    { current: usage.current_tts_minutes, max: usage.effective_max_tts_minutes },
  ];

  const hasCritical = metrics.some((m) => getAlertLevel(getPercentage(m.current, m.max)) === "critical");
  const hasWarning = metrics.some((m) => getAlertLevel(getPercentage(m.current, m.max)) === "warning");

  if (hasCritical) {
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
        <AlertCircle className="h-3 w-3 mr-1" />
        Limite
      </Badge>
    );
  }

  if (hasWarning) {
    return (
      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
        <AlertTriangle className="h-3 w-3 mr-1" />
        80%+
      </Badge>
    );
  }

  return null;
}

// Get current billing period
function getCurrentBillingPeriod(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const label = format(start, "dd/MM", { locale: ptBR }) + " - " + format(end, "dd/MM", { locale: ptBR });
  return { start, end, label };
}

export function CompanyUsageTable() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const { deleteCompany } = useCompanies();
  const billingPeriod = getCurrentBillingPeriod();

  // Fetch company usage data with agent details
  const { data: companies, isLoading } = useQuery({
    queryKey: ["company-usage-dashboard"],
    queryFn: async () => {
      // Fetch usage summary
      const { data: usageData, error: usageError } = await supabase
        .from("company_usage_summary")
        .select("*");

      if (usageError) {
        throw usageError;
      }

      // Fetch company details for status, created_at, etc.
      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select("id, status, created_at, law_firm_id");

      if (companyError) {
        throw companyError;
      }

      // Fetch law_firms for subdomain
      const { data: lawFirmData } = await supabase
        .from("law_firms")
        .select("id, subdomain");

      // Fetch all agents (automations) with their law_firm_id
      const { data: agentsData } = await supabase
        .from("automations")
        .select("id, name, is_active, law_firm_id");

      // Fetch conversation counts per agent (conversations with AI messages)
      // We count conversations that have AI-generated messages this month
      const currentMonth = new Date();
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString();
      
      const { data: conversationsData } = await supabase
        .from("conversations")
        .select("id, law_firm_id")
        .gte("created_at", startOfMonth);

      const { data: aiMessagesData } = await supabase
        .from("messages")
        .select("conversation_id")
        .eq("ai_generated", true)
        .gte("created_at", startOfMonth);

      // Create a set of conversation IDs that have AI messages
      const conversationsWithAI = new Set(aiMessagesData?.map(m => m.conversation_id) || []);

      // Count AI conversations per law_firm
      const aiConversationsPerLawFirm: Record<string, number> = {};
      conversationsData?.forEach(conv => {
        if (conversationsWithAI.has(conv.id)) {
          aiConversationsPerLawFirm[conv.law_firm_id] = (aiConversationsPerLawFirm[conv.law_firm_id] || 0) + 1;
        }
      });

      // Merge data
      const merged: CompanyWithStatus[] = (usageData || []).map((usage: any) => {
        const company = companyData?.find((c) => c.id === usage.company_id);
        const lawFirm = lawFirmData?.find((lf) => lf.id === usage.law_firm_id);
        
        // Get agents for this company with conversation counts
        const companyAgents = (agentsData || [])
          .filter(a => a.law_firm_id === usage.law_firm_id)
          .map(agent => ({
            id: agent.id,
            name: agent.name,
            is_active: agent.is_active,
            // For now, distribute conversations evenly among active agents
            // In a real scenario, we'd track which agent handled which conversation
            conversations_count: 0, // Will be calculated below
          }));

        // Distribute AI conversations among agents (simplified)
        const totalAIConversations = aiConversationsPerLawFirm[usage.law_firm_id] || 0;
        const activeAgents = companyAgents.filter(a => a.is_active);
        if (activeAgents.length > 0 && totalAIConversations > 0) {
          // For simplicity, assign all conversations to the first active agent
          // In a real implementation, you'd track this in the database
          activeAgents[0].conversations_count = totalAIConversations;
        }

        return {
          ...usage,
          status: company?.status || "unknown",
          created_at: company?.created_at || "",
          subdomain: lawFirm?.subdomain || null,
          agents: companyAgents,
        };
      });

      return merged;
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  // Filter and search
  const filteredCompanies = useMemo(() => {
    if (!companies) return [];

    return companies.filter((company) => {
      // Status filter
      if (statusFilter !== "all" && company.status !== statusFilter) {
        return false;
      }

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          company.company_name?.toLowerCase().includes(searchLower) ||
          company.subdomain?.toLowerCase().includes(searchLower) ||
          company.plan_name?.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });
  }, [companies, statusFilter, search]);

  // Stats
  const stats = useMemo(() => {
    if (!companies) return { total: 0, active: 0, pending: 0, suspended: 0 };
    return {
      total: companies.length,
      active: companies.filter((c) => c.status === "active").length,
      pending: companies.filter((c) => c.status === "pending").length,
      suspended: companies.filter((c) => c.status === "suspended" || c.status === "blocked").length,
    };
  }, [companies]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Ativa</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pendente</Badge>;
      case "suspended":
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Suspensa</Badge>;
      case "blocked":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Bloqueada</Badge>;
      case "cancelled":
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">cancelled</Badge>;
      default:
        return <Badge className="bg-white/20 text-white/60">{status}</Badge>;
    }
  };

  const handleDeleteCompany = async () => {
    if (!deleteConfirm) return;
    
    // Fetch the full company data needed for deletion
    const { data: companyData } = await supabase
      .from("companies")
      .select("*, law_firm:law_firms(id, subdomain)")
      .eq("id", deleteConfirm.id)
      .single();
    
    if (companyData) {
      deleteCompany.mutate(companyData as any);
    }
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-red-500" />
            Empresas Ativas
          </h2>
          <p className="text-sm text-white/50">
            Acompanhamento de consumo do plano • Ciclo: {billingPeriod.label}
          </p>
        </div>

        {/* Quick stats */}
        <div className="flex gap-3 flex-wrap">
          <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
            <span className="text-xs text-white/50">Total</span>
            <p className="text-lg font-bold text-white">{stats.total}</p>
          </div>
          <div className="px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <span className="text-xs text-green-400">Ativas</span>
            <p className="text-lg font-bold text-green-400">{stats.active}</p>
          </div>
          <div className="px-4 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <span className="text-xs text-yellow-400">Pendentes</span>
            <p className="text-lg font-bold text-yellow-400">{stats.pending}</p>
          </div>
          <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <span className="text-xs text-red-400">Suspensas</span>
            <p className="text-lg font-bold text-red-400">{stats.suspended}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            placeholder="Buscar por nome, subdomínio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-full sm:w-48 bg-white/5 border-white/10 text-white">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1a1a] border-white/10">
            <SelectItem value="all" className="text-white hover:bg-white/10">Todas</SelectItem>
            <SelectItem value="active" className="text-white hover:bg-white/10">Ativas</SelectItem>
            <SelectItem value="pending" className="text-white hover:bg-white/10">Pendentes</SelectItem>
            <SelectItem value="suspended" className="text-white hover:bg-white/10">Suspensas</SelectItem>
            <SelectItem value="blocked" className="text-white hover:bg-white/10">Bloqueadas</SelectItem>
            <SelectItem value="cancelled" className="text-white hover:bg-white/10">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <ScrollArea className="max-h-[600px]">
          <Table>
            <TableHeader className="bg-white/5 sticky top-0">
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/60 font-medium">Empresa</TableHead>
                <TableHead className="text-white/60 font-medium">Plano</TableHead>
                <TableHead className="text-white/60 font-medium">Status</TableHead>
                <TableHead className="text-white/60 font-medium">Alertas</TableHead>
                <TableHead className="text-white/60 font-medium">Consumo</TableHead>
                <TableHead className="text-white/60 font-medium text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-red-500" />
                  </TableCell>
                </TableRow>
              ) : filteredCompanies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-white/40">
                    Nenhuma empresa encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredCompanies.map((company) => (
                  <>
                    <TableRow
                      key={company.company_id}
                      className="border-white/10 hover:bg-white/5 cursor-pointer"
                      onClick={() => setExpandedRow(expandedRow === company.company_id ? null : company.company_id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-white/5">
                            <Building2 className="h-4 w-4 text-white/60" />
                          </div>
                          <div>
                            <p className="font-medium text-white">{company.company_name}</p>
                            {company.subdomain && (
                              <p className="text-xs text-white/40">{company.subdomain}.miauchat.com.br</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              company.plan_name === "Enterprise"
                                ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                                : company.plan_name === "Professional"
                                ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                                : "bg-white/10 text-white/60"
                            }
                          >
                            {company.plan_name || "Sem plano"}
                          </Badge>
                          {company.use_custom_limits && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 px-1">
                                    <Settings className="h-3 w-3" />
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="bg-[#1a1a1a] border-white/10">
                                  Limites personalizados
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(company.status)}</TableCell>
                      <TableCell>
                        <CompanyAlertBadge usage={company} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-4">
                          <UsageProgress
                            current={company.current_users}
                            max={company.effective_max_users}
                            label="Usuários"
                          />
                          <UsageProgress
                            current={company.current_ai_conversations}
                            max={company.effective_max_ai_conversations}
                            label="IA/mês"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {company.status === "cancelled" && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteConfirm({ id: company.company_id, name: company.company_name });
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="bg-[#1a1a1a] border-white/10">
                                  Excluir empresa cancelada
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/global-admin/companies?edit=${company.company_id}`);
                            }}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedRow(expandedRow === company.company_id ? null : company.company_id);
                            }}
                          >
                            {expandedRow === company.company_id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded row with detailed usage */}
                    {expandedRow === company.company_id && (
                      <TableRow className="border-white/10 bg-white/[0.02]">
                        <TableCell colSpan={6} className="p-4">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium text-white">
                                Consumo Detalhado • Ciclo: {billingPeriod.label}
                              </h4>
                              <div className="flex items-center gap-2 text-xs text-white/40">
                                <Calendar className="h-3 w-3" />
                                Criada em {format(new Date(company.created_at), "dd/MM/yyyy", { locale: ptBR })}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                              {/* Users */}
                              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <div className="flex items-center gap-2 mb-2">
                                  <Users className="h-4 w-4 text-blue-400" />
                                  <span className="text-xs text-white/60">Usuários</span>
                                </div>
                                <UsageProgress
                                  current={company.current_users}
                                  max={company.effective_max_users}
                                  label=""
                                />
                                <p className="mt-1 text-lg font-bold text-white">
                                  {company.current_users}
                                  <span className="text-sm text-white/40 font-normal">/{company.effective_max_users}</span>
                                </p>
                              </div>

                              {/* Connections */}
                              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <div className="flex items-center gap-2 mb-2">
                                  <Wifi className="h-4 w-4 text-green-400" />
                                  <span className="text-xs text-white/60">WhatsApp</span>
                                </div>
                                <UsageProgress
                                  current={company.current_instances}
                                  max={company.effective_max_instances}
                                  label=""
                                />
                                <p className="mt-1 text-lg font-bold text-white">
                                  {company.current_instances}
                                  <span className="text-sm text-white/40 font-normal">/{company.effective_max_instances}</span>
                                </p>
                              </div>

                              {/* AI Agents */}
                              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <div className="flex items-center gap-2 mb-2">
                                  <Bot className="h-4 w-4 text-purple-400" />
                                  <span className="text-xs text-white/60">Agentes IA</span>
                                </div>
                                <UsageProgress
                                  current={company.current_agents}
                                  max={company.effective_max_agents}
                                  label=""
                                />
                                <p className="mt-1 text-lg font-bold text-white">
                                  {company.current_agents}
                                  <span className="text-sm text-white/40 font-normal">/{company.effective_max_agents}</span>
                                </p>
                              </div>

                              {/* AI Conversations */}
                              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <div className="flex items-center gap-2 mb-2">
                                  <MessageSquare className="h-4 w-4 text-orange-400" />
                                  <span className="text-xs text-white/60">Conversas IA/mês</span>
                                </div>
                                <UsageProgress
                                  current={company.current_ai_conversations}
                                  max={company.effective_max_ai_conversations}
                                  label=""
                                />
                                <p className="mt-1 text-lg font-bold text-white">
                                  {company.current_ai_conversations}
                                  <span className="text-sm text-white/40 font-normal">/{company.effective_max_ai_conversations}</span>
                                </p>
                              </div>

                              {/* TTS Minutes */}
                              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <div className="flex items-center gap-2 mb-2">
                                  <Mic className="h-4 w-4 text-red-400" />
                                  <span className="text-xs text-white/60">Áudio/mês (min)</span>
                                </div>
                                <UsageProgress
                                  current={company.current_tts_minutes}
                                  max={company.effective_max_tts_minutes}
                                  label=""
                                />
                                <p className="mt-1 text-lg font-bold text-white">
                                  {Math.round(company.current_tts_minutes)}
                                  <span className="text-sm text-white/40 font-normal">/{company.effective_max_tts_minutes}</span>
                                </p>
                              </div>
                            </div>

                            {/* Agents breakdown */}
                            {company.agents && company.agents.length > 0 && (
                              <div className="mt-4">
                                <h5 className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                                  <Bot className="h-4 w-4 text-purple-400" />
                                  Agentes de IA ({company.agents.length})
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {company.agents.map((agent) => (
                                    <div 
                                      key={agent.id}
                                      className="p-2 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between"
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${agent.is_active ? 'bg-green-500' : 'bg-gray-500'}`} />
                                        <span className="text-sm text-white truncate max-w-[150px]">{agent.name}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-xs">
                                        <MessageSquare className="h-3 w-3 text-orange-400" />
                                        <span className="text-white/60">{agent.conversations_count}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2 pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                                onClick={() => navigate(`/global-admin/companies?edit=${company.company_id}`)}
                              >
                                <Settings className="h-3 w-3 mr-2" />
                                Ajustar Limites
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                                onClick={() => navigate(`/global-admin/companies?edit=${company.company_id}`)}
                              >
                                <ArrowUpRight className="h-3 w-3 mr-2" />
                                Alterar Plano
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-[#1a1a1a] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Excluir empresa?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Você está prestes a excluir permanentemente a empresa{" "}
              <span className="font-medium text-white">{deleteConfirm?.name}</span>.
              <br /><br />
              Esta ação é irreversível e todos os dados relacionados serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCompany}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
