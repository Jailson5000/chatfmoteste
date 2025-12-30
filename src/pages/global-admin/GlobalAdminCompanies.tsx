import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, MoreHorizontal, Search, Building2, Pencil, Trash2, ExternalLink, Globe, Settings, RefreshCw, Workflow, AlertCircle, CheckCircle2, Clock, Copy, Link, Play, Server, Zap, Activity, Heart, Mail, MailX, Send, KeyRound, UserCheck, UserX, Hourglass, Check, X, Filter, Users, Wifi, CalendarDays, CreditCard, Bot, BarChart3, Lock, Unlock, Layers, MessageSquare, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useCompanies } from "@/hooks/useCompanies";
import { usePlans } from "@/hooks/usePlans";
import { DomainConfigDialog } from "@/components/global-admin/DomainConfigDialog";
import { CompanyAIConfigDialog } from "@/components/global-admin/CompanyAIConfigDialog";
import { CompanyLimitsEditor } from "@/components/global-admin/CompanyLimitsEditor";
import { CompanyUsageMonitor } from "@/components/global-admin/CompanyUsageMonitor";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { companyFieldConfig, adminCreateCompanySchema } from "@/lib/schemas/companySchema";
import { generateSubdomainFromName } from "@/hooks/useTenant";
import { formatPhone, formatDocument } from "@/lib/inputMasks";

export default function GlobalAdminCompanies() {
  const { companies, pendingApprovalCompanies, isLoading, createCompany, updateCompany, deleteCompany, retryN8nWorkflow, runHealthCheck, retryAllFailedWorkflows, resendInitialAccess, approveCompany, rejectCompany } = useCompanies();
  const { plans } = usePlans();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<string | null>(null);
  const [domainConfigCompany, setDomainConfigCompany] = useState<typeof companies[0] | null>(null);
  const [aiConfigCompany, setAiConfigCompany] = useState<typeof companies[0] | null>(null);
  const [usageMonitorCompany, setUsageMonitorCompany] = useState<typeof companies[0] | null>(null);
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);
  const [rejectingCompany, setRejectingCompany] = useState<typeof companies[0] | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  // State to track plan changes for pending companies
  const [pendingPlanChanges, setPendingPlanChanges] = useState<Record<string, string>>({});
  // Advanced filters state
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPlan, setFilterPlan] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");

  const handleResetPassword = async (company: typeof companies[0]) => {
    if (!company.admin_user_id) {
      toast.error("Esta empresa não possui um usuário administrador configurado");
      return;
    }
    
    const newPassword = "Teste@123";
    const confirmReset = confirm(
      `Resetar a senha do admin da empresa "${company.name}"?\n\nNova senha: ${newPassword}\n\nEmail: Verifique no perfil do usuário`
    );
    
    if (!confirmReset) return;
    
    setResettingPassword(company.id);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error("Você precisa estar logado como admin global");
        return;
      }
      
      const response = await supabase.functions.invoke('reset-user-password', {
        body: {
          user_id: company.admin_user_id,
          new_password: newPassword
        }
      });
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      toast.success(`Senha resetada com sucesso!\n\nNova senha: ${newPassword}`);
    } catch (error: any) {
      console.error("Error resetting password:", error);
      toast.error(`Erro ao resetar senha: ${error.message}`);
    } finally {
      setResettingPassword(null);
    }
  };
  
  const [formData, setFormData] = useState({
    name: "",
    document: "",
    email: "",
    phone: "",
    plan_id: "",
    max_users: 5,
    max_instances: 2,
    max_agents: 1,
    max_workspaces: 1,
    max_ai_conversations: 250,
    max_tts_minutes: 40,
    use_custom_limits: false,
    subdomain: "",
    auto_activate_workflow: true,
    admin_name: "",
    admin_email: "",
  });

  // Auto-fill limits when plan changes
  const handlePlanSelect = (planId: string) => {
    const selectedPlan = plans.find(p => p.id === planId);
    if (selectedPlan && !formData.use_custom_limits) {
      setFormData({
        ...formData,
        plan_id: planId,
        max_users: selectedPlan.max_users,
        max_instances: selectedPlan.max_instances,
        max_agents: selectedPlan.max_agents ?? 1,
        max_workspaces: selectedPlan.max_workspaces ?? 1,
        max_ai_conversations: selectedPlan.max_ai_conversations ?? 250,
        max_tts_minutes: selectedPlan.max_tts_minutes ?? 40,
      });
    } else {
      setFormData({ ...formData, plan_id: planId });
    }
  };

  // Apply all filters
  const filteredCompanies = companies.filter((company) => {
    // Text search filter
    const matchesSearch = 
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.law_firm?.subdomain?.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Status filter
    const matchesStatus = filterStatus === "all" || company.status === filterStatus;
    
    // Plan filter
    const matchesPlan = filterPlan === "all" || company.plan_id === filterPlan;
    
    // Date filter
    let matchesDate = true;
    if (filterDateFrom) {
      matchesDate = matchesDate && new Date(company.created_at) >= new Date(filterDateFrom);
    }
    if (filterDateTo) {
      const toDate = new Date(filterDateTo);
      toDate.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && new Date(company.created_at) <= toDate;
    }
    
    return matchesSearch && matchesStatus && matchesPlan && matchesDate;
  });

  const clearFilters = () => {
    setSearchQuery("");
    setFilterStatus("all");
    setFilterPlan("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const hasActiveFilters = filterStatus !== "all" || filterPlan !== "all" || filterDateFrom || filterDateTo;

  const handleNameChange = (value: string) => {
    const newSubdomain = generateSubdomainFromName(value);
    setFormData({ 
      ...formData, 
      name: value, 
      subdomain: formData.subdomain || newSubdomain 
    });
  };

  const resetFormData = () => ({
    name: "",
    document: "",
    email: "",
    phone: "",
    plan_id: "",
    max_users: 5,
    max_instances: 2,
    max_agents: 1,
    max_workspaces: 1,
    max_ai_conversations: 250,
    max_tts_minutes: 40,
    use_custom_limits: false,
    subdomain: "",
    auto_activate_workflow: true,
    admin_name: "",
    admin_email: "",
  });

  const handleCreate = async () => {
    await createCompany.mutateAsync({
      ...formData,
      auto_activate_workflow: formData.auto_activate_workflow,
      admin_name: formData.admin_name || undefined,
      admin_email: formData.admin_email || undefined,
    });
    setIsCreateDialogOpen(false);
    setFormData(resetFormData());
  };

  const handleUpdate = async () => {
    if (!editingCompany) return;
    await updateCompany.mutateAsync({ id: editingCompany, ...formData });
    setEditingCompany(null);
    setFormData(resetFormData());
  };

  const handleDelete = async (company: typeof companies[0]) => {
    if (confirm("Tem certeza que deseja excluir esta empresa? O workflow n8n também será removido.")) {
      await deleteCompany.mutateAsync(company);
    }
  };

  const openEditDialog = (company: typeof companies[0]) => {
    const companyPlan = plans.find(p => p.id === company.plan_id);
    setFormData({
      name: company.name,
      document: company.document || "",
      email: company.email || "",
      phone: company.phone || "",
      plan_id: company.plan_id || "",
      max_users: company.max_users,
      max_instances: company.max_instances,
      max_agents: company.max_agents ?? companyPlan?.max_agents ?? 1,
      max_workspaces: company.max_workspaces ?? companyPlan?.max_workspaces ?? 1,
      max_ai_conversations: company.max_ai_conversations ?? companyPlan?.max_ai_conversations ?? 250,
      max_tts_minutes: company.max_tts_minutes ?? companyPlan?.max_tts_minutes ?? 40,
      use_custom_limits: company.use_custom_limits || false,
      subdomain: company.law_firm?.subdomain || "",
      auto_activate_workflow: true,
      admin_name: "",
      admin_email: "",
    });
    setEditingCompany(company.id);
  };

  const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default",
    trial: "secondary",
    suspended: "destructive",
    cancelled: "outline",
  };

  const statusLabels: Record<string, string> = {
    active: "Ativa",
    trial: "Trial",
    suspended: "Suspensa",
    cancelled: "Cancelada",
  };

  const approvalStatusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    pending_approval: "secondary",
    approved: "default",
    rejected: "destructive",
  };

  const approvalStatusLabels: Record<string, string> = {
    pending_approval: "Pendente",
    approved: "Aprovada",
    rejected: "Rejeitada",
  };

  const provisioningStatusColors: Record<string, string> = {
    active: "text-green-600 bg-green-50 border-green-200",
    partial: "text-yellow-600 bg-yellow-50 border-yellow-200",
    pending: "text-blue-600 bg-blue-50 border-blue-200",
    error: "text-red-600 bg-red-50 border-red-200",
  };

  const provisioningStatusLabels: Record<string, string> = {
    active: "Completo",
    partial: "Parcial",
    pending: "Pendente",
    error: "Erro",
  };

  const componentStatusIcons: Record<string, React.ReactNode> = {
    created: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,
    creating: <Clock className="h-3.5 w-3.5 text-blue-600 animate-pulse" />,
    pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
    error: <AlertCircle className="h-3.5 w-3.5 text-red-600" />,
  };

  // Count companies with issues
  const failedWorkflowsCount = companies.filter(c => 
    c.n8n_workflow_status === 'error' || c.n8n_workflow_status === 'failed'
  ).length;

  const healthStatusColors: Record<string, string> = {
    healthy: "text-green-600",
    degraded: "text-yellow-600",
    unhealthy: "text-red-600",
    unknown: "text-muted-foreground",
  };

  const handleApprove = async (company: typeof companies[0]) => {
    const selectedPlanId = pendingPlanChanges[company.id] || company.plan_id;
    const selectedPlan = plans.find(p => p.id === selectedPlanId);
    
    const confirmApprove = confirm(
      `Aprovar empresa "${company.name}"?\n\nPlano: ${selectedPlan?.name || 'Não definido'}\n\nIsso irá provisionar o APP do cliente, criar workflow n8n e enviar email de acesso.`
    );
    if (!confirmApprove) return;
    await approveCompany.mutateAsync({ 
      companyId: company.id,
      planId: selectedPlanId || undefined,
    });
    // Clear the pending change after approval
    setPendingPlanChanges(prev => {
      const { [company.id]: _, ...rest } = prev;
      return rest;
    });
  };

  const handlePlanChange = (companyId: string, planId: string) => {
    setPendingPlanChanges(prev => ({
      ...prev,
      [companyId]: planId,
    }));
  };

  const handleReject = async () => {
    if (!rejectingCompany) return;
    await rejectCompany.mutateAsync({ 
      companyId: rejectingCompany.id, 
      reason: rejectionReason 
    });
    setRejectingCompany(null);
    setRejectionReason("");
  };

  // Filter companies by approval status for tabs
  const pendingCompanies = companies.filter(c => c.approval_status === 'pending_approval');
  const approvedCompanies = companies.filter(c => c.approval_status === 'approved' || !c.approval_status);
  const rejectedCompanies = companies.filter(c => c.approval_status === 'rejected');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Empresas</h1>
          <p className="text-muted-foreground">
            Gerencie as empresas cadastradas no sistema
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Health Check Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => runHealthCheck.mutate(undefined)}
                  disabled={runHealthCheck.isPending}
                >
                  <Heart className={`mr-2 h-4 w-4 ${runHealthCheck.isPending ? 'animate-pulse' : ''}`} />
                  Health Check
                </Button>
              </TooltipTrigger>
              <TooltipContent>Verificar saúde de todos os tenants</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Retry Failed Workflows Button */}
          {failedWorkflowsCount > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => retryAllFailedWorkflows.mutate()}
                    disabled={retryAllFailedWorkflows.isPending}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${retryAllFailedWorkflows.isPending ? 'animate-spin' : ''}`} />
                    Retry ({failedWorkflowsCount})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Tentar novamente workflows que falharam</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova Empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] flex flex-col p-0">
              <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
                <DialogTitle>Nova Empresa</DialogTitle>
                <DialogDescription>
                  Preencha os dados para cadastrar uma nova empresa
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{companyFieldConfig.companyName.label} *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder={companyFieldConfig.companyName.placeholder}
                      maxLength={companyFieldConfig.companyName.maxLength}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subdomain">Subdomínio</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="subdomain"
                        value={formData.subdomain}
                        onChange={(e) => setFormData({ ...formData, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                        placeholder="empresa"
                        className="flex-1"
                        maxLength={30}
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">.miauchat.com.br</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Este será o endereço de acesso: https://{formData.subdomain || 'empresa'}.miauchat.com.br
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="document">{companyFieldConfig.document.label}</Label>
                      <Input
                        id="document"
                        value={formData.document}
                        onChange={(e) => setFormData({ ...formData, document: formatDocument(e.target.value) })}
                        placeholder="000.000.000-00 ou 00.000.000/0000-00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">{companyFieldConfig.phone.label}</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{companyFieldConfig.email.label}</Label>
                    <Input
                      id="email"
                      type={companyFieldConfig.email.type}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder={companyFieldConfig.email.placeholder}
                      maxLength={companyFieldConfig.email.maxLength}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan">Plano *</Label>
                    <Select
                      value={formData.plan_id}
                      onValueChange={handlePlanSelect}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um plano" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.filter(p => p.is_active).map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{plan.name}</span>
                              <span className="text-muted-foreground">R$ {plan.price}/mês</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formData.plan_id && (
                      <p className="text-xs text-muted-foreground">
                        Limites serão preenchidos automaticamente com base no plano selecionado
                      </p>
                    )}
                  </div>
                  {/* Limits Section */}
                  <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium flex items-center gap-2">
                        {formData.use_custom_limits ? <Unlock className="h-4 w-4 text-yellow-600" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                        Limites da Empresa
                      </p>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="use_custom_limits" className="text-xs text-muted-foreground">Personalizar</Label>
                        <Switch
                          id="use_custom_limits"
                          checked={formData.use_custom_limits}
                          onCheckedChange={(checked) => setFormData({ ...formData, use_custom_limits: checked })}
                        />
                      </div>
                    </div>
                    {formData.use_custom_limits && (
                      <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                        Limites personalizados sobrescrevem o plano
                      </Badge>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="max_users" className="text-xs flex items-center gap-1"><Users className="h-3 w-3" />Usuários</Label>
                        <Input id="max_users" type="number" value={formData.max_users} disabled={!formData.use_custom_limits}
                          onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) || 0, use_custom_limits: true })} className="h-8" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="max_instances" className="text-xs flex items-center gap-1"><Wifi className="h-3 w-3" />Conexões</Label>
                        <Input id="max_instances" type="number" value={formData.max_instances} disabled={!formData.use_custom_limits}
                          onChange={(e) => setFormData({ ...formData, max_instances: parseInt(e.target.value) || 0, use_custom_limits: true })} className="h-8" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="max_agents" className="text-xs flex items-center gap-1"><Bot className="h-3 w-3" />Agentes IA</Label>
                        <Input id="max_agents" type="number" value={formData.max_agents} disabled={!formData.use_custom_limits}
                          onChange={(e) => setFormData({ ...formData, max_agents: parseInt(e.target.value) || 0, use_custom_limits: true })} className="h-8" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="max_workspaces" className="text-xs flex items-center gap-1"><Layers className="h-3 w-3" />Workspaces</Label>
                        <Input id="max_workspaces" type="number" value={formData.max_workspaces} disabled={!formData.use_custom_limits}
                          onChange={(e) => setFormData({ ...formData, max_workspaces: parseInt(e.target.value) || 0, use_custom_limits: true })} className="h-8" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="max_ai_conversations" className="text-xs flex items-center gap-1"><MessageSquare className="h-3 w-3" />IA/mês</Label>
                        <Input id="max_ai_conversations" type="number" value={formData.max_ai_conversations} disabled={!formData.use_custom_limits}
                          onChange={(e) => setFormData({ ...formData, max_ai_conversations: parseInt(e.target.value) || 0, use_custom_limits: true })} className="h-8" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="max_tts_minutes" className="text-xs flex items-center gap-1"><Volume2 className="h-3 w-3" />Áudio/mês</Label>
                        <Input id="max_tts_minutes" type="number" value={formData.max_tts_minutes} disabled={!formData.use_custom_limits}
                          onChange={(e) => setFormData({ ...formData, max_tts_minutes: parseInt(e.target.value) || 0, use_custom_limits: true })} className="h-8" />
                      </div>
                    </div>
                  </div>
                  
                  {/* Admin User Section */}
                  <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                    <p className="text-sm font-medium">Administrador da Empresa</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="admin_name">{companyFieldConfig.adminName.label}</Label>
                        <Input
                          id="admin_name"
                          value={formData.admin_name}
                          onChange={(e) => setFormData({ ...formData, admin_name: e.target.value })}
                          placeholder={companyFieldConfig.adminName.placeholder}
                          maxLength={companyFieldConfig.adminName.maxLength}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="admin_email">{companyFieldConfig.email.label} do Admin</Label>
                        <Input
                          id="admin_email"
                          type={companyFieldConfig.email.type}
                          value={formData.admin_email}
                          onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                          placeholder="admin@empresa.com"
                          maxLength={companyFieldConfig.email.maxLength}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Um email de acesso inicial será enviado automaticamente para este administrador.
                    </p>
                  </div>
                  
                  {/* n8n Workflow Settings */}
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto_activate" className="text-base font-medium">
                        Ativar Workflow n8n Automaticamente
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Ativa o workflow após criação para receber mensagens imediatamente
                      </p>
                    </div>
                    <Switch
                      id="auto_activate"
                      checked={formData.auto_activate_workflow}
                      onCheckedChange={(checked) => setFormData({ ...formData, auto_activate_workflow: checked })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={createCompany.isPending || !formData.name || !formData.subdomain}>
                  {createCompany.isPending ? "Provisionando..." : "Criar Empresa"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar empresas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Status filter */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="suspended">Suspensa</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Plan filter */}
            <Select value={filterPlan} onValueChange={setFilterPlan}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="Plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Planos</SelectItem>
                {plans.filter(p => p.is_active).map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Date filters */}
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 flex gap-4">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Data início
                </Label>
                <Input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Data fim</Label>
                <Input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <X className="h-4 w-4 mr-1" />
                Limpar filtros
              </Button>
            )}
          </div>
          
          {hasActiveFilters && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>{filteredCompanies.length} empresa(s) encontrada(s)</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs for Approval Status */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Hourglass className="h-4 w-4" />
            Pendentes
            {pendingCompanies.length > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingCompanies.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            Aprovadas
          </TabsTrigger>
          <TabsTrigger value="rejected" className="flex items-center gap-2">
            <UserX className="h-4 w-4" />
            Rejeitadas
          </TabsTrigger>
        </TabsList>

        {/* Pending Companies Tab */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hourglass className="h-5 w-5 text-yellow-500" />
                Empresas Pendentes de Aprovação
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingCompanies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma empresa aguardando aprovação
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Subdomínio</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Plano Escolhido</TableHead>
                      <TableHead>Cadastrada em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingCompanies.map((company) => {
                      const currentPlanId = pendingPlanChanges[company.id] || company.plan_id;
                      const selectedPlan = plans.find(p => p.id === currentPlanId);
                      const hasChangedPlan = pendingPlanChanges[company.id] && pendingPlanChanges[company.id] !== company.plan_id;
                      
                      return (
                        <TableRow key={company.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{company.name}</p>
                              <p className="text-sm text-muted-foreground">{company.document || '-'}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {company.law_firm?.subdomain ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Globe className="h-3 w-3 text-muted-foreground" />
                                <span className="font-mono">{company.law_firm.subdomain}.miauchat.com.br</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{company.email}</p>
                              <p className="text-sm text-muted-foreground">{company.phone || '-'}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              <Select
                                value={currentPlanId || ''}
                                onValueChange={(value) => handlePlanChange(company.id, value)}
                              >
                                <SelectTrigger className={`w-[180px] ${hasChangedPlan ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' : ''}`}>
                                  <SelectValue placeholder="Selecionar plano" />
                                </SelectTrigger>
                                <SelectContent>
                                  {plans.filter(p => p.is_active).map((plan) => (
                                    <SelectItem key={plan.id} value={plan.id}>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{plan.name}</span>
                                        <span className="text-muted-foreground">
                                          R$ {plan.price}/mês
                                        </span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {selectedPlan && (
                                <div className="text-xs text-muted-foreground">
                                  {selectedPlan.max_users} usuários • {selectedPlan.max_instances} conexões
                                </div>
                              )}
                              {hasChangedPlan && (
                                <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                                  Plano alterado
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {new Date(company.created_at).toLocaleDateString("pt-BR", {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApprove(company)}
                                disabled={approveCompany.isPending}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setRejectingCompany(company)}
                                disabled={rejectCompany.isPending}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Rejeitar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approved Companies Tab */}
        <TabsContent value="approved">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Empresas Aprovadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Subdomínio</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Provisionamento</TableHead>
                      <TableHead>Email Acesso</TableHead>
                      <TableHead>Usuários</TableHead>
                      <TableHead>Conexões</TableHead>
                      <TableHead>Criada em</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies.filter(c => c.approval_status !== 'pending_approval' && c.approval_status !== 'rejected').length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          Nenhuma empresa encontrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCompanies.filter(c => c.approval_status !== 'pending_approval' && c.approval_status !== 'rejected').map((company) => (
                        <TableRow key={company.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{company.name}</p>
                              <p className="text-sm text-muted-foreground">{company.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {company.law_firm?.subdomain ? (
                              <a 
                                href={`https://${company.law_firm.subdomain}.miauchat.com.br`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline"
                              >
                                <Globe className="h-3 w-3" />
                                {company.law_firm.subdomain}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {company.plan ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="space-y-1 cursor-pointer">
                                      <Badge variant="secondary" className="font-medium">
                                        {company.plan.name}
                                      </Badge>
                                      <p className="text-xs text-muted-foreground">
                                        R$ {company.plan.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                                      </p>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="w-52 p-0">
                                    <div className="p-3 space-y-2">
                                      <p className="font-semibold text-sm border-b pb-2">
                                        Plano {company.plan.name}
                                      </p>
                                      <div className="space-y-1.5 text-sm">
                                        <div className="flex items-center gap-2">
                                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span>{company.max_users} usuários</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span>{company.max_instances} conexões</span>
                                        </div>
                                        <div className="flex items-center gap-2 pt-1 border-t">
                                          <CreditCard className="h-3.5 w-3.5 text-green-600" />
                                          <span className="font-medium text-green-600">
                                            R$ {company.plan.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusColors[company.status] || "outline"}>
                              {statusLabels[company.status] || company.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-md border text-xs font-medium cursor-pointer ${provisioningStatusColors[company.provisioning_status] || provisioningStatusColors.pending}`}>
                                    {company.provisioning_status === 'active' && <CheckCircle2 className="h-3.5 w-3.5" />}
                                    {company.provisioning_status === 'partial' && <AlertCircle className="h-3.5 w-3.5" />}
                                    {company.provisioning_status === 'pending' && <Clock className="h-3.5 w-3.5 animate-pulse" />}
                                    {company.provisioning_status === 'error' && <AlertCircle className="h-3.5 w-3.5" />}
                                    {provisioningStatusLabels[company.provisioning_status] || 'Pendente'}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="w-72 p-0" side="right">
                                  <div className="p-3 space-y-3">
                                    <p className="font-semibold text-sm border-b pb-2">Status de Provisionamento</p>
                                    
                                    {/* Client App Status */}
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Server className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm">Client App</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        {componentStatusIcons[company.client_app_status] || componentStatusIcons.pending}
                                        <span className="text-xs capitalize">{company.client_app_status || 'pending'}</span>
                                      </div>
                                    </div>

                                    {/* n8n Workflow Status */}
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Zap className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm">Workflow n8n</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        {componentStatusIcons[company.n8n_workflow_status || 'pending'] || componentStatusIcons.pending}
                                        <span className="text-xs capitalize">{company.n8n_workflow_status || 'pending'}</span>
                                      </div>
                                    </div>

                                    {/* n8n Details if created */}
                                    {company.n8n_workflow_status === 'created' && company.n8n_workflow_id && (
                                      <div className="pt-2 border-t space-y-2">
                                        <p className="text-xs font-medium">{company.n8n_workflow_name}</p>
                                        <div className="flex items-center gap-1">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-xs"
                                            onClick={() => {
                                              const webhookUrl = `https://n8n.miauchat.com.br/webhook/${company.law_firm?.subdomain || company.id}`;
                                              navigator.clipboard.writeText(webhookUrl);
                                              toast.success("Webhook URL copiado!");
                                            }}
                                          >
                                            <Copy className="h-3 w-3 mr-1" /> Copiar Webhook
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-xs"
                                            onClick={() => {
                                              window.open(`https://n8n.miauchat.com.br/workflow/${company.n8n_workflow_id}`, '_blank');
                                            }}
                                          >
                                            <ExternalLink className="h-3 w-3 mr-1" /> Abrir n8n
                                          </Button>
                                        </div>
                                      </div>
                                    )}

                                    {/* Error message */}
                                    {company.n8n_last_error && (
                                      <div className="pt-2 border-t">
                                        <p className="text-xs text-destructive">{company.n8n_last_error}</p>
                                      </div>
                                    )}

                                    {/* Retry buttons */}
                                    {(company.n8n_workflow_status === 'error' || company.n8n_workflow_status === 'failed' || !company.n8n_workflow_status) && (
                                      <div className="pt-2 border-t">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => retryN8nWorkflow.mutate(company)}
                                          disabled={retryN8nWorkflow.isPending}
                                          className="w-full h-7 text-xs"
                                        >
                                          <RefreshCw className={`h-3 w-3 mr-1 ${retryN8nWorkflow.isPending ? 'animate-spin' : ''}`} />
                                          Recriar Workflow n8n
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          {/* Email de Acesso Inicial */}
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-2">
                                    {company.initial_access_email_sent ? (
                                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium text-green-600 bg-green-50 border-green-200">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Enviado
                                      </div>
                                    ) : company.initial_access_email_error ? (
                                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium text-red-600 bg-red-50 border-red-200">
                                        <MailX className="h-3.5 w-3.5" />
                                        Erro
                                      </div>
                                    ) : company.admin_user_id ? (
                                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium text-yellow-600 bg-yellow-50 border-yellow-200">
                                        <Clock className="h-3.5 w-3.5" />
                                        Pendente
                                      </div>
                                    ) : (
                                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium text-muted-foreground bg-muted/50">
                                        <Mail className="h-3.5 w-3.5" />
                                        Sem Admin
                                      </div>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs p-3" side="top">
                                  {company.initial_access_email_sent ? (
                                    <div className="space-y-1">
                                      <p className="font-medium text-sm">Email enviado com sucesso</p>
                                      <p className="text-xs text-muted-foreground">
                                        {company.initial_access_email_sent_at 
                                          ? new Date(company.initial_access_email_sent_at).toLocaleString("pt-BR")
                                          : "Data não registrada"}
                                      </p>
                                    </div>
                                  ) : company.initial_access_email_error ? (
                                    <div className="space-y-1">
                                      <p className="font-medium text-sm text-destructive">Falha no envio</p>
                                      <p className="text-xs">{company.initial_access_email_error}</p>
                                    </div>
                                  ) : company.admin_user_id ? (
                                    <p className="text-sm">Email de acesso ainda não enviado</p>
                                  ) : (
                                    <p className="text-sm">Nenhum administrador configurado</p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {/* Botão de reenvio */}
                            {company.admin_user_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 mt-1"
                                onClick={() => resendInitialAccess.mutate({ companyId: company.id, resetPassword: true })}
                                disabled={resendInitialAccess.isPending}
                              >
                                <Send className={`h-3 w-3 mr-1 ${resendInitialAccess.isPending ? 'animate-pulse' : ''}`} />
                                <span className="text-xs">Reenviar</span>
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>{company.max_users}</TableCell>
                          <TableCell>{company.max_instances}</TableCell>
                          <TableCell>
                            {new Date(company.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditDialog(company)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDomainConfigCompany(company)}>
                                  <Settings className="mr-2 h-4 w-4" />
                                  Configurar Domínio
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setAiConfigCompany(company)}>
                                  <Bot className="mr-2 h-4 w-4" />
                                  Configurar IA
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleResetPassword(company)}
                                  disabled={resettingPassword === company.id || !company.admin_user_id}
                                >
                                  <KeyRound className="mr-2 h-4 w-4" />
                                  {resettingPassword === company.id ? "Resetando..." : "Resetar Senha Admin"}
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleDelete(company)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rejected Companies Tab */}
        <TabsContent value="rejected">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserX className="h-5 w-5 text-red-500" />
                Empresas Rejeitadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rejectedCompanies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma empresa rejeitada
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Motivo da Rejeição</TableHead>
                      <TableHead>Rejeitada em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rejectedCompanies.map((company) => (
                      <TableRow key={company.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{company.name}</p>
                            <p className="text-sm text-muted-foreground">{company.document || '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{company.email}</p>
                            <p className="text-sm text-muted-foreground">{company.phone || '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted-foreground max-w-xs truncate">
                            {company.rejection_reason || 'Não informado'}
                          </p>
                        </TableCell>
                        <TableCell>
                          {company.rejected_at 
                            ? new Date(company.rejected_at).toLocaleDateString("pt-BR")
                            : '-'
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editingCompany} onOpenChange={(open) => !open && setEditingCompany(null)}>
        <DialogContent className="max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
            <DialogTitle>Editar Empresa</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome da Empresa</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-document">CNPJ/CPF</Label>
                  <Input
                    id="edit-document"
                    value={formData.document}
                    onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Telefone</Label>
                  <Input
                    id="edit-phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-plan">Plano</Label>
                <Select
                  value={formData.plan_id}
                  onValueChange={(value) => setFormData({ ...formData, plan_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um plano" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} - R$ {plan.price}/mês
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-max_users">Máx. Usuários</Label>
                  <Input
                    id="edit-max_users"
                    type="number"
                    value={formData.max_users}
                    onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-max_instances">Máx. Conexões</Label>
                  <Input
                    id="edit-max_instances"
                    type="number"
                    value={formData.max_instances}
                    onChange={(e) => setFormData({ ...formData, max_instances: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
            <Button variant="outline" onClick={() => setEditingCompany(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updateCompany.isPending}>
              {updateCompany.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Domain Config Dialog */}
      <DomainConfigDialog
        open={!!domainConfigCompany}
        onOpenChange={(open) => !open && setDomainConfigCompany(null)}
        company={domainConfigCompany}
      />

      {/* Rejection Dialog */}
      <Dialog open={!!rejectingCompany} onOpenChange={(open) => !open && setRejectingCompany(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-red-500" />
              Rejeitar Empresa
            </DialogTitle>
            <DialogDescription>
              Confirme a rejeição da empresa "{rejectingCompany?.name}". Esta ação não poderá ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Motivo da Rejeição (opcional)</Label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Informe o motivo da rejeição..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingCompany(null)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={rejectCompany.isPending}
            >
              {rejectCompany.isPending ? "Rejeitando..." : "Confirmar Rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Config Dialog */}
      <CompanyAIConfigDialog
        company={aiConfigCompany}
        open={!!aiConfigCompany}
        onOpenChange={(open) => !open && setAiConfigCompany(null)}
      />
    </div>
  );
}
