import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, MoreHorizontal, Search, Building2, Pencil, Trash2, ExternalLink, Globe, Settings, RefreshCw, Workflow, AlertCircle, CheckCircle2, Clock, Copy, Link, Play, Server, Zap, Activity, Heart, Mail, MailX, Send, KeyRound, UserCheck, UserX, Hourglass, Check, X, Filter, Users, Wifi, CalendarDays, CreditCard, Bot, BarChart3, Lock, Unlock, Layers, MessageSquare, Volume2, AlertTriangle, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SuspendCompanyDialog } from "@/components/global-admin/SuspendCompanyDialog";
import { Switch } from "@/components/ui/switch";
import { useCompanies } from "@/hooks/useCompanies";
import { usePlans } from "@/hooks/usePlans";
import { DomainConfigDialog } from "@/components/global-admin/DomainConfigDialog";
import { CompanyAIConfigDialog } from "@/components/global-admin/CompanyAIConfigDialog";
import { CompanyLimitsEditor } from "@/components/global-admin/CompanyLimitsEditor";
import { CompanyUsageMonitor } from "@/components/global-admin/CompanyUsageMonitor";
import { CompanyUsersDialog } from "@/components/global-admin/CompanyUsersDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { companyFieldConfig, adminCreateCompanySchema } from "@/lib/schemas/companySchema";
import { generateSubdomainFromName } from "@/hooks/useTenant";
import { formatPhone, formatDocument } from "@/lib/inputMasks";
import { AddonRequestsSection } from "@/components/global-admin/AddonRequestsSection";
import { OrphanLawFirmsTab } from "@/components/global-admin/OrphanLawFirmsTab";
import { useOrphanLawFirms } from "@/hooks/useOrphanLawFirms";
import { ScrollArea } from "@/components/ui/scroll-area";
import { generateCompanyReportPDF, exportCompanyReportToExcel, CompanyReportData } from "@/lib/companyReportGenerator";
import { differenceInDays, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

export default function GlobalAdminCompanies() {
  const { companies, pendingApprovalCompanies, isLoading, createCompany, updateCompany, deleteCompany, retryN8nWorkflow, runHealthCheck, retryAllFailedWorkflows, resendInitialAccess, approveCompany, rejectCompany, suspendCompany, unsuspendCompany } = useCompanies();
  const { plans } = usePlans();
  const { summary: orphanSummary } = useOrphanLawFirms();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<string | null>(null);
  const [domainConfigCompany, setDomainConfigCompany] = useState<typeof companies[0] | null>(null);
  const [aiConfigCompany, setAiConfigCompany] = useState<typeof companies[0] | null>(null);
  const [usageMonitorCompany, setUsageMonitorCompany] = useState<typeof companies[0] | null>(null);
  const [usersDialogCompany, setUsersDialogCompany] = useState<typeof companies[0] | null>(null);
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);
  const [rejectingCompany, setRejectingCompany] = useState<typeof companies[0] | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [activeTab, setActiveTab] = useState("approved");
  const [editParamProcessed, setEditParamProcessed] = useState(false);
  const [billingCompany, setBillingCompany] = useState<typeof companies[0] | null>(null);
  const [billingType, setBillingType] = useState<"monthly" | "yearly">("monthly");
  const [isGeneratingBilling, setIsGeneratingBilling] = useState(false);
  const [suspendingCompany, setSuspendingCompany] = useState<typeof companies[0] | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [billingDetailCompany, setBillingDetailCompany] = useState<typeof companies[0] | null>(null);
  const [isSyncingStripe, setIsSyncingStripe] = useState(false);

  // Effect to detect edit param from URL and open correct tab + dialog
  const editCompanyId = searchParams.get("edit");
  
  useEffect(() => {
    if (editCompanyId && companies.length > 0 && !editParamProcessed) {
      const company = companies.find(c => c.id === editCompanyId);
      
      if (company) {
        // Determine which tab to open based on approval_status
        const targetTab = 
          company.approval_status === 'pending_approval' ? 'pending' :
          company.approval_status === 'rejected' ? 'rejected' : 
          'approved';
        
        setActiveTab(targetTab);
        
        // Open edit dialog for this company
        openEditDialog(company);
        
        // Mark as processed and clear URL param
        setEditParamProcessed(true);
        setSearchParams({}, { replace: true });
      }
    }
  }, [editCompanyId, companies, editParamProcessed]);
  // State to track plan changes for pending companies
  const [pendingPlanChanges, setPendingPlanChanges] = useState<Record<string, string>>({});
  // State to track trial checkbox for pending companies
  const [pendingTrialChanges, setPendingTrialChanges] = useState<Record<string, boolean>>({});
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
    
    const confirmReset = confirm(
      `Resetar a senha do admin da empresa "${company.name}"?\n\nUma senha temporária segura será gerada automaticamente.\nO usuário será obrigado a alterá-la no primeiro login.\n\nEmail: ${company.email || 'Verifique no perfil'}`
    );
    
    if (!confirmReset) return;
    
    setResettingPassword(company.id);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error("Você precisa estar logado como admin global");
        return;
      }
      
      // Call the secure admin-reset-password function
      // Password is generated server-side for security
      const response = await supabase.functions.invoke('admin-reset-password', {
        body: {
          email: company.email
        }
      });
      
      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Erro desconhecido');
      }
      
      // Show the temporary password to the admin
      const tempPassword = response.data.temporary_password;
      toast.success(
        `Senha resetada com sucesso!\n\nSenha temporária: ${tempPassword}\n\nO usuário deverá alterá-la no primeiro login.`,
        { duration: 15000 }
      );
    } catch (error: any) {
      console.error("Error resetting password:", error);
      toast.error(`Erro ao resetar senha: ${error.message}`);
    } finally {
      setResettingPassword(null);
    }
  };

  const handleGenerateBilling = async () => {
    if (!billingCompany) return;
    
    setIsGeneratingBilling(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error("Você precisa estar logado como admin global");
        return;
      }
      
      const response = await supabase.functions.invoke('admin-create-stripe-subscription', {
        body: {
          company_id: billingCompany.id,
          billing_type: billingType,
        }
      });
      
      // Check for edge function invocation error
      if (response.error) {
        throw new Error(response.error.message);
      }

      // Check for business logic error in response data
      if (!response.data?.success) {
        // Handle specific case of existing subscription
        if (response.data?.existing_subscription_id) {
          toast.error(
            `Esta empresa já possui uma assinatura ativa (${response.data.existing_subscription_id}). Use "Atualizar Assinatura" para modificar o valor.`,
            { duration: 8000 }
          );
          setBillingCompany(null);
          return;
        }
        throw new Error(response.data?.error || 'Erro desconhecido');
      }
      
      const priceFormatted = response.data.price?.toFixed(2).replace('.', ',');
      const nextDueDate = response.data.next_due_date;
      
      // Show success message with subscription details
      toast.success(
        `✅ Assinatura criada com sucesso!\n\nPlano: ${response.data.plan_name}\nValor: R$ ${priceFormatted}/${billingType === 'yearly' ? 'ano' : 'mês'}\nPróximo vencimento: ${nextDueDate}\n\nO cliente receberá email do Stripe para pagamento.`,
        { duration: 15000 }
      );
      
      setBillingCompany(null);
    } catch (error: any) {
      console.error("Error generating billing:", error);
      toast.error(`Erro ao gerar cobrança: ${error.message}`);
    } finally {
      setIsGeneratingBilling(false);
    }
  };

  const handleSyncStripe = async () => {
    setIsSyncingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-stripe-subscriptions");
      if (error) throw error;
      toast.success(
        `Stripe sincronizado! ${data.synced} assinatura(s) atualizadas${data.failed > 0 ? `, ${data.failed} falharam` : ""}.`,
        { duration: 7000 }
      );
      // Refresh companies data
      window.location.reload();
    } catch (err: any) {
      toast.error(`Erro ao sincronizar Stripe: ${err.message}`);
    } finally {
      setIsSyncingStripe(false);
    }
  };
  
  const [formData, setFormData] = useState({
    name: "",
    document: "",
    email: "",
    phone: "",
    plan_id: "",
    max_users: 2,
    max_instances: 1,
    max_agents: 1,
    max_workspaces: 1,
    max_ai_conversations: 200,
    max_tts_minutes: 10,
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
        max_ai_conversations: selectedPlan.max_ai_conversations ?? 200,
        max_tts_minutes: selectedPlan.max_tts_minutes ?? 10,
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
    max_users: 2,
    max_instances: 1,
    max_agents: 1,
    max_workspaces: 1,
    max_ai_conversations: 200,
    max_tts_minutes: 10,
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
    
    // Find selected plan for value calculation
    const selectedPlan = plans.find(p => p.id === formData.plan_id);
    
    // Calculate the new monthly value for Stripe sync
    let newMonthlyValue = selectedPlan?.price || 0;
    if (formData.use_custom_limits && selectedPlan) {
      const additionalUsers = Math.max(0, formData.max_users - selectedPlan.max_users);
      const additionalInstances = Math.max(0, formData.max_instances - selectedPlan.max_instances);
      newMonthlyValue += (additionalUsers * 29.90) + (additionalInstances * 57.90);
    }
    
    // Only send fields that exist in the companies table
    const updateData = {
      name: formData.name,
      document: formData.document,
      email: formData.email,
      phone: formData.phone,
      plan_id: formData.plan_id,
      max_users: formData.max_users,
      max_instances: formData.max_instances,
      max_agents: formData.max_agents,
      max_workspaces: formData.max_workspaces,
      max_ai_conversations: formData.max_ai_conversations,
      max_tts_minutes: formData.max_tts_minutes,
      use_custom_limits: formData.use_custom_limits,
    };
    
    try {
      // 1. Update the company in the database
      await updateCompany.mutateAsync({ id: editingCompany, ...updateData });
      
      // 2. Sync subscription value with Stripe (if company has custom limits or plan changed)
      if (selectedPlan) {
        const { data: stripeResult, error: stripeError } = await supabase.functions.invoke('update-stripe-subscription', {
          body: {
            company_id: editingCompany,
            new_value: newMonthlyValue,
            reason: "Limites atualizados pelo admin"
          }
        });
        
        if (stripeError) {
          console.error("Stripe sync error:", stripeError);
          toast.error("Empresa atualizada, mas houve erro ao sincronizar com Stripe: " + stripeError.message);
        } else if (stripeResult?.skipped) {
          // Company doesn't have an active Stripe subscription yet
          toast.info(stripeResult.message || "Empresa sem assinatura Stripe ativa. O valor será aplicado quando assinar.");
        } else if (stripeResult?.success) {
          const oldValue = stripeResult.old_value || 0;
          const diff = newMonthlyValue - oldValue;
          const diffText = diff > 0 ? `+R$ ${diff.toFixed(2).replace('.', ',')}` : 
                          diff < 0 ? `-R$ ${Math.abs(diff).toFixed(2).replace('.', ',')}` : 
                          "sem alteração";
          toast.success(
            `Empresa e Stripe atualizados!\n\nValor anterior: R$ ${oldValue.toFixed(2).replace('.', ',')}\nNovo valor: R$ ${newMonthlyValue.toFixed(2).replace('.', ',')}\nDiferença: ${diffText}`,
            { duration: 8000 }
          );
        }
      }
      
      setEditingCompany(null);
      setFormData(resetFormData());
    } catch (error: any) {
      console.error("Error updating company:", error);
      toast.error("Erro ao atualizar empresa: " + error.message);
    }
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
    const enableTrial = pendingTrialChanges[company.id] || false;
    
    const trialInfo = enableTrial ? '\n🕐 Trial: 7 dias ativado' : '';
    const confirmApprove = confirm(
      `Aprovar empresa "${company.name}"?\n\nPlano: ${selectedPlan?.name || 'Não definido'}${trialInfo}\n\nIsso irá provisionar o APP do cliente, criar workflow n8n e enviar email de acesso.`
    );
    if (!confirmApprove) return;
    await approveCompany.mutateAsync({ 
      companyId: company.id,
      planId: selectedPlanId || undefined,
      enableTrial,
    });
    // Clear the pending changes after approval
    setPendingPlanChanges(prev => {
      const { [company.id]: _, ...rest } = prev;
      return rest;
    });
    setPendingTrialChanges(prev => {
      const { [company.id]: _, ...rest } = prev;
      return rest;
    });
  };

  const handleTrialChange = (companyId: string, enabled: boolean) => {
    setPendingTrialChanges(prev => ({
      ...prev,
      [companyId]: enabled,
    }));
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
          {/* Export PDF Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={async () => {
                    setIsExportingPDF(true);
                    try {
                      // Fetch billing data for all companies in batch
                      const companyIds = companies.map(c => c.id);
                      let billingData: Record<string, {
                        hasActiveSubscription: boolean;
                        subscriptionStatus: string | null;
                        lastPaymentAt: string | null;
                        nextInvoiceAt: string | null;
                        openInvoicesCount: number;
                        openInvoicesTotal: number;
                      }> = {};
                      
                      try {
                        const { data: billingSummary, error: billingError } = await supabase.functions.invoke('get-company-billing-summary', {
                          body: { company_ids: companyIds }
                        });
                        
                        if (billingError) {
                          console.warn('Could not fetch billing summary:', billingError);
                        } else if (billingSummary?.data) {
                          billingData = billingSummary.data;
                        }
                      } catch (e) {
                        console.warn('Error fetching billing summary:', e);
                      }
                      
                      // Build report data with billing info
                      const reportData: CompanyReportData[] = companies.map((company) => {
                        const plan = plans.find(p => p.id === company.plan_id);
                        
                        // Calculate trial days remaining
                        let trialDaysRemaining: number | null = null;
                        if (company.trial_ends_at) {
                          const trialEnd = new Date(company.trial_ends_at);
                          trialDaysRemaining = differenceInDays(trialEnd, new Date());
                        }
                        
                        // Get billing data for this company
                        const billing = billingData[company.id] || {
                          hasActiveSubscription: false,
                          subscriptionStatus: null,
                          lastPaymentAt: null,
                          nextInvoiceAt: null,
                          openInvoicesCount: 0,
                          openInvoicesTotal: 0,
                        };
                        
                        return {
                          name: company.name,
                          document: company.document,
                          planName: plan?.name || 'Sem plano',
                          status: company.status,
                          approvalStatus: company.approval_status || 'approved',
                          isActive: company.status === 'active' && company.approval_status !== 'pending_approval',
                          approvedAt: company.approved_at,
                          trialDaysRemaining,
                          openInvoicesCount: billing.openInvoicesCount,
                          openInvoicesTotal: billing.openInvoicesTotal,
                          hasActiveSubscription: billing.hasActiveSubscription,
                          subscriptionStatus: billing.subscriptionStatus,
                          lastPaymentAt: billing.lastPaymentAt,
                          nextInvoiceAt: billing.nextInvoiceAt,
                        };
                      });
                      
                      generateCompanyReportPDF({
                        companies: reportData,
                        generatedAt: new Date(),
                      });
                      
                      toast.success('Relatório PDF exportado com sucesso!');
                    } catch (error) {
                      console.error('Error exporting PDF:', error);
                      toast.error('Erro ao exportar PDF');
                    } finally {
                      setIsExportingPDF(false);
                    }
                  }}
                  disabled={isExportingPDF || companies.length === 0}
                >
                  <FileText className={`mr-2 h-4 w-4 ${isExportingPDF ? 'animate-pulse' : ''}`} />
                  {isExportingPDF ? 'Exportando...' : 'Exportar PDF'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Exportar relatório PDF de todas as empresas</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Export Excel Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={async () => {
                    setIsExportingExcel(true);
                    try {
                      // Fetch billing data for all companies in batch
                      const companyIds = companies.map(c => c.id);
                      let billingData: Record<string, {
                        hasActiveSubscription: boolean;
                        subscriptionStatus: string | null;
                        lastPaymentAt: string | null;
                        nextInvoiceAt: string | null;
                        openInvoicesCount: number;
                        openInvoicesTotal: number;
                      }> = {};
                      
                      try {
                        const { data: billingSummary, error: billingError } = await supabase.functions.invoke('get-company-billing-summary', {
                          body: { company_ids: companyIds }
                        });
                        
                        if (billingError) {
                          console.warn('Could not fetch billing summary:', billingError);
                        } else if (billingSummary?.data) {
                          billingData = billingSummary.data;
                        }
                      } catch (e) {
                        console.warn('Error fetching billing summary:', e);
                      }
                      
                      // Build report data with billing info
                      const reportData: CompanyReportData[] = companies.map((company) => {
                        const plan = plans.find(p => p.id === company.plan_id);
                        
                        // Calculate trial days remaining
                        let trialDaysRemaining: number | null = null;
                        if (company.trial_ends_at) {
                          const trialEnd = new Date(company.trial_ends_at);
                          trialDaysRemaining = differenceInDays(trialEnd, new Date());
                        }
                        
                        // Get billing data for this company
                        const billing = billingData[company.id] || {
                          hasActiveSubscription: false,
                          subscriptionStatus: null,
                          lastPaymentAt: null,
                          nextInvoiceAt: null,
                          openInvoicesCount: 0,
                          openInvoicesTotal: 0,
                        };
                        
                        return {
                          name: company.name,
                          document: company.document,
                          planName: plan?.name || 'Sem plano',
                          status: company.status,
                          approvalStatus: company.approval_status || 'approved',
                          isActive: company.status === 'active' && company.approval_status !== 'pending_approval',
                          approvedAt: company.approved_at,
                          trialDaysRemaining,
                          openInvoicesCount: billing.openInvoicesCount,
                          openInvoicesTotal: billing.openInvoicesTotal,
                          hasActiveSubscription: billing.hasActiveSubscription,
                          subscriptionStatus: billing.subscriptionStatus,
                          lastPaymentAt: billing.lastPaymentAt,
                          nextInvoiceAt: billing.nextInvoiceAt,
                        };
                      });
                      
                      exportCompanyReportToExcel({
                        companies: reportData,
                        generatedAt: new Date(),
                      });
                      
                      toast.success('Relatório Excel exportado com sucesso!');
                    } catch (error) {
                      console.error('Error exporting Excel:', error);
                      toast.error('Erro ao exportar Excel');
                    } finally {
                      setIsExportingExcel(false);
                    }
                  }}
                  disabled={isExportingExcel || companies.length === 0}
                >
                  <FileText className={`mr-2 h-4 w-4 ${isExportingExcel ? 'animate-pulse' : ''}`} />
                  {isExportingExcel ? 'Exportando...' : 'Exportar Excel'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Exportar relatório Excel de todas as empresas</TooltipContent>
            </Tooltip>
          </TooltipProvider>

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

          {/* Sync Stripe Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={handleSyncStripe}
                  disabled={isSyncingStripe}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingStripe ? 'animate-spin' : ''}`} />
                  {isSyncingStripe ? 'Sincronizando...' : 'Sincronizar Stripe'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Atualizar datas de vencimento das assinaturas via Stripe API</TooltipContent>
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

      {/* Addon Requests Section - Show above tabs when there are pending requests */}
      <AddonRequestsSection />

      {/* Tabs for Approval Status */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 mb-4">
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
          <TabsTrigger value="orphans" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Órfãos
            {orphanSummary.total > 0 && (
              <Badge variant="secondary" className="ml-1">{orphanSummary.total}</Badge>
            )}
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
                      <TableHead className="text-center">Trial 7 dias</TableHead>
                      <TableHead>Cadastrada em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingCompanies.map((company) => {
                      const currentPlanId = pendingPlanChanges[company.id] || company.plan_id;
                      const selectedPlan = plans.find(p => p.id === currentPlanId);
                      const hasChangedPlan = pendingPlanChanges[company.id] && pendingPlanChanges[company.id] !== company.plan_id;
                      const isTrialEnabled = pendingTrialChanges[company.id] ?? false;
                      
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
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              <Checkbox
                                id={`trial-${company.id}`}
                                checked={isTrialEnabled}
                                onCheckedChange={(checked) => handleTrialChange(company.id, checked === true)}
                              />
                              {isTrialEnabled && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400">
                                  <Clock className="h-3 w-3 mr-1" />
                                  7 dias
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
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : (
                <ScrollArea className="max-h-[calc(100vh-320px)]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Subdomínio</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Faturamento</TableHead>
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
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
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
                            <div className="flex flex-col gap-1">
                              <Badge variant={statusColors[company.status] || "outline"}>
                                {statusLabels[company.status] || company.status}
                              </Badge>
                              {/* Trial indicator with remaining days */}
                              {company.trial_type && company.trial_type !== 'none' && company.trial_ends_at && (
                                (() => {
                                  const now = new Date();
                                  const trialEnd = new Date(company.trial_ends_at);
                                  const diffTime = trialEnd.getTime() - now.getTime();
                                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                  const isExpired = diffDays <= 0;
                                  
                                  return (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Badge 
                                            variant="outline" 
                                            className={`text-xs ${
                                              isExpired 
                                                ? 'bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400' 
                                                : diffDays <= 2 
                                                  ? 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400'
                                                  : 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400'
                                            }`}
                                          >
                                            <Clock className="h-3 w-3 mr-1" />
                                            {isExpired 
                                              ? 'Trial expirado' 
                                              : `${diffDays} dia${diffDays !== 1 ? 's' : ''} restante${diffDays !== 1 ? 's' : ''}`
                                            }
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="text-sm">
                                            <p><strong>Trial {company.trial_type === 'manual' ? 'Manual' : 'Automático'}</strong></p>
                                            <p>Início: {company.trial_started_at ? new Date(company.trial_started_at).toLocaleDateString('pt-BR') : '-'}</p>
                                            <p>Término: {new Date(company.trial_ends_at).toLocaleDateString('pt-BR')}</p>
                                            {isExpired && <p className="text-red-500 font-medium mt-1">Acesso bloqueado</p>}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  );
                                })()
                              )}
                            </div>
                          </TableCell>
                          {/* Billing/Faturamento Column */}
                          <TableCell>
                            {(() => {
                              const sub = Array.isArray(company.subscription) ? company.subscription[0] : company.subscription;
                              
                              if (!sub || !sub.stripe_subscription_id) {
                                return (
                                  <div className="flex flex-col gap-0.5">
                                    <Badge variant="outline" className="text-muted-foreground w-fit">
                                      Sem assinatura
                                    </Badge>
                                    {company.trial_ends_at && (
                                      <span className="text-xs text-muted-foreground">
                                        Trial até {new Date(company.trial_ends_at).toLocaleDateString('pt-BR')}
                                      </span>
                                    )}
                                  </div>
                                );
                              }
                              
                              const status = sub.status;
                              const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
                              const lastPayment = sub.last_payment_at ? new Date(sub.last_payment_at) : null;
                              const now = new Date();
                              const daysUntilDue = periodEnd ? Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                              
                              let badgeClass = "";
                              let label = "";
                              let icon = null;
                              
                              if (status === 'active') {
                                badgeClass = "bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400";
                                label = "Em dia";
                                icon = <CheckCircle2 className="h-3 w-3" />;
                              } else if (status === 'trialing') {
                                badgeClass = "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400";
                                label = "Trial";
                                icon = <Clock className="h-3 w-3" />;
                              } else if (status === 'past_due') {
                                const daysOverdue = daysUntilDue ? Math.abs(daysUntilDue) : 0;
                                badgeClass = "bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400";
                                label = daysOverdue > 0 ? `Vencido (${daysOverdue}d)` : "Vencido";
                                icon = <AlertCircle className="h-3 w-3" />;
                              } else if (status === 'canceled') {
                                badgeClass = "bg-gray-50 text-gray-600 border-gray-300 dark:bg-gray-900/20 dark:text-gray-400";
                                label = "Cancelada";
                                icon = <X className="h-3 w-3" />;
                              } else if (status === 'unpaid') {
                                badgeClass = "bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400";
                                label = "Inadimplente";
                                icon = <AlertTriangle className="h-3 w-3" />;
                              } else {
                                badgeClass = "text-muted-foreground";
                                label = status || "Desconhecido";
                              }
                              
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex flex-col gap-0.5 cursor-pointer group">
                                        <Badge variant="outline" className={`text-xs gap-1 w-fit ${badgeClass}`}>
                                          {icon}
                                          {label}
                                        </Badge>
                                        {lastPayment && (
                                          <span className="text-xs text-muted-foreground">
                                            Pgto: {lastPayment.toLocaleDateString('pt-BR')}
                                          </span>
                                        )}
                                        {periodEnd && (
                                          <span className={`text-xs font-medium ${daysUntilDue !== null && daysUntilDue <= 5 && daysUntilDue >= 0 ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`}>
                                            Venc: {periodEnd.toLocaleDateString('pt-BR')}
                                          </span>
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="w-56 p-0">
                                      <div className="p-3 space-y-2">
                                        <p className="font-semibold text-sm border-b pb-2">Assinatura Stripe</p>
                                        <div className="space-y-1.5 text-sm">
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Status:</span>
                                            <span className="font-medium capitalize">{status}</span>
                                          </div>
                                          {lastPayment && (
                                            <div className="flex justify-between">
                                              <span className="text-muted-foreground">Último pgto:</span>
                                              <span>{lastPayment.toLocaleDateString('pt-BR')}</span>
                                            </div>
                                          )}
                                          {periodEnd && (
                                            <div className="flex justify-between">
                                              <span className="text-muted-foreground">Próx. venc:</span>
                                              <span className={daysUntilDue !== null && daysUntilDue <= 5 && daysUntilDue >= 0 ? 'text-orange-600 font-medium' : ''}>{periodEnd.toLocaleDateString('pt-BR')}</span>
                                            </div>
                                          )}
                                          {daysUntilDue !== null && daysUntilDue >= 0 && (
                                            <div className="flex justify-between">
                                              <span className="text-muted-foreground">Faltam:</span>
                                              <span>{daysUntilDue} dias</span>
                                            </div>
                                          )}
                                          {company.plan && (
                                            <div className="flex justify-between pt-1 border-t">
                                              <span className="text-muted-foreground">Valor:</span>
                                              <span className="font-medium text-green-600">
                                                R$ {company.plan.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
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
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm">{new Date(company.created_at).toLocaleDateString("pt-BR")}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(company.created_at), { locale: ptBR, addSuffix: true })}
                              </span>
                            </div>
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
                                <DropdownMenuItem onClick={() => setUsersDialogCompany(company)}>
                                  <Users className="mr-2 h-4 w-4" />
                                  Ver Usuários
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleResetPassword(company)}
                                  disabled={resettingPassword === company.id || !company.admin_user_id}
                                >
                                  <KeyRound className="mr-2 h-4 w-4" />
                                  {resettingPassword === company.id ? "Resetando..." : "Resetar Senha Admin"}
                                </DropdownMenuItem>
                                 <DropdownMenuSeparator />
                                 <DropdownMenuItem onClick={() => setBillingDetailCompany(company)}>
                                   <FileText className="mr-2 h-4 w-4" />
                                   Ver Detalhe Financeiro
                                 </DropdownMenuItem>
                                 <DropdownMenuItem
                                   onClick={() => {
                                     setBillingCompany(company);
                                     setBillingType("monthly");
                                   }}
                                   disabled={!company.plan_id}
                                   className="text-green-600 focus:text-green-600"
                                 >
                                   <CreditCard className="mr-2 h-4 w-4" />
                                   Gerar Cobrança Stripe
                                 </DropdownMenuItem>
                                {company.status !== 'suspended' ? (
                                  <DropdownMenuItem
                                    onClick={() => setSuspendingCompany(company)}
                                    className="text-orange-600 focus:text-orange-600"
                                  >
                                    <Lock className="mr-2 h-4 w-4" />
                                    Suspender Empresa
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (confirm(`Liberar acesso da empresa "${company.name}"?`)) {
                                        unsuspendCompany.mutate(company.id);
                                      }
                                    }}
                                    disabled={unsuspendCompany.isPending}
                                    className="text-green-600 focus:text-green-600"
                                  >
                                    <Unlock className="mr-2 h-4 w-4" />
                                    Liberar Empresa
                                  </DropdownMenuItem>
                                )}
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
                </ScrollArea>
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

        {/* Orphan Law Firms Tab */}
        <TabsContent value="orphans">
          <OrphanLawFirmsTab />
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
                <div>
                  <Select
                    value={formData.plan_id}
                    onValueChange={handlePlanSelect}
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
                {formData.plan_id && !formData.use_custom_limits && (
                  <p className="text-xs text-muted-foreground">
                    Limites serão atualizados automaticamente com base no plano selecionado
                  </p>
                )}
              </div>
              
              {/* Limits Section in Edit Dialog */}
              <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium flex items-center gap-2">
                    {formData.use_custom_limits ? <Unlock className="h-4 w-4 text-yellow-600" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                    Limites da Empresa
                  </p>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="edit_use_custom_limits" className="text-xs text-muted-foreground">Personalizar</Label>
                    <Switch
                      id="edit_use_custom_limits"
                      checked={formData.use_custom_limits}
                      onCheckedChange={(checked) => {
                        if (!checked && formData.plan_id) {
                          const selectedPlan = plans.find(p => p.id === formData.plan_id);
                          if (selectedPlan) {
                            setFormData({
                              ...formData,
                              use_custom_limits: false,
                              max_users: selectedPlan.max_users,
                              max_instances: selectedPlan.max_instances,
                              max_agents: selectedPlan.max_agents ?? 1,
                              max_workspaces: selectedPlan.max_workspaces ?? 1,
                              max_ai_conversations: selectedPlan.max_ai_conversations ?? 250,
                              max_tts_minutes: selectedPlan.max_tts_minutes ?? 40,
                            });
                            return;
                          }
                        }
                        setFormData({ ...formData, use_custom_limits: checked });
                      }}
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
                    <Label htmlFor="edit_max_users" className="text-xs flex items-center gap-1"><Users className="h-3 w-3" />Usuários</Label>
                    <Input id="edit_max_users" type="number" value={formData.max_users} disabled={!formData.use_custom_limits}
                      onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) || 0, use_custom_limits: true })} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit_max_instances" className="text-xs flex items-center gap-1"><Wifi className="h-3 w-3" />Conexões</Label>
                    <Input id="edit_max_instances" type="number" value={formData.max_instances} disabled={!formData.use_custom_limits}
                      onChange={(e) => setFormData({ ...formData, max_instances: parseInt(e.target.value) || 0, use_custom_limits: true })} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit_max_agents" className="text-xs flex items-center gap-1"><Bot className="h-3 w-3" />Agentes IA</Label>
                    <Input id="edit_max_agents" type="number" value={formData.max_agents} disabled={!formData.use_custom_limits}
                      onChange={(e) => setFormData({ ...formData, max_agents: parseInt(e.target.value) || 0, use_custom_limits: true })} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit_max_workspaces" className="text-xs flex items-center gap-1"><Layers className="h-3 w-3" />Workspaces</Label>
                    <Input id="edit_max_workspaces" type="number" value={formData.max_workspaces} disabled={!formData.use_custom_limits}
                      onChange={(e) => setFormData({ ...formData, max_workspaces: parseInt(e.target.value) || 0, use_custom_limits: true })} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit_max_ai_conversations" className="text-xs flex items-center gap-1"><MessageSquare className="h-3 w-3" />IA/mês</Label>
                    <Input id="edit_max_ai_conversations" type="number" value={formData.max_ai_conversations} disabled={!formData.use_custom_limits}
                      onChange={(e) => setFormData({ ...formData, max_ai_conversations: parseInt(e.target.value) || 0, use_custom_limits: true })} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit_max_tts_minutes" className="text-xs flex items-center gap-1"><Volume2 className="h-3 w-3" />Áudio/mês</Label>
                    <Input id="edit_max_tts_minutes" type="number" value={formData.max_tts_minutes} disabled={!formData.use_custom_limits}
                      onChange={(e) => setFormData({ ...formData, max_tts_minutes: parseInt(e.target.value) || 0, use_custom_limits: true })} className="h-8" />
                  </div>
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

      {/* Company Users Dialog */}
      <CompanyUsersDialog
        open={!!usersDialogCompany}
        onOpenChange={(open) => !open && setUsersDialogCompany(null)}
        company={usersDialogCompany ? {
          id: usersDialogCompany.id,
          name: usersDialogCompany.name,
          law_firm_id: usersDialogCompany.law_firm_id,
        } : null}
      />

      {/* Generate Stripe Billing Dialog */}
      <Dialog open={!!billingCompany} onOpenChange={(open) => !open && setBillingCompany(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-green-600" />
              Gerar Cobrança Stripe
            </DialogTitle>
            <DialogDescription>
              Crie um link de pagamento para a empresa "{billingCompany?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <div className="p-3 bg-muted rounded-md">
                <p className="font-medium">{billingCompany?.name}</p>
                <p className="text-sm text-muted-foreground">{billingCompany?.email}</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Plano</Label>
              <div className="p-3 bg-muted rounded-md">
                <p className="font-medium">{billingCompany?.plan?.name || 'Não definido'}</p>
                <p className="text-sm text-muted-foreground">
                  R$ {billingCompany?.plan?.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Período de Cobrança</Label>
              <Select value={billingType} onValueChange={(v) => setBillingType(v as "monthly" | "yearly")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">
                    <div className="flex items-center gap-2">
                      <span>Mensal</span>
                      <span className="text-muted-foreground">
                        R$ {billingCompany?.plan?.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="yearly">
                    <div className="flex items-center gap-2">
                      <span>Anual</span>
                      <span className="text-muted-foreground">
                        R$ {((billingCompany?.plan?.price || 0) * 11).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <Badge variant="outline" className="ml-1 text-xs">1 mês grátis</Badge>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBillingCompany(null)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleGenerateBilling}
              disabled={isGeneratingBilling || !billingCompany?.plan}
              className="bg-green-600 hover:bg-green-700"
            >
              {isGeneratingBilling ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Gerar Link de Pagamento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Company Dialog */}
      <SuspendCompanyDialog
        open={!!suspendingCompany}
        onOpenChange={(open) => !open && setSuspendingCompany(null)}
        companyName={suspendingCompany?.name || ""}
        onConfirm={(reason) => {
          if (suspendingCompany) {
            suspendCompany.mutate(
              { companyId: suspendingCompany.id, reason },
              { onSuccess: () => setSuspendingCompany(null) }
            );
          }
        }}
        isLoading={suspendCompany.isPending}
      />

      {/* Billing Detail Sheet */}
      <Sheet open={!!billingDetailCompany} onOpenChange={(open) => !open && setBillingDetailCompany(null)}>
        <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
          {billingDetailCompany && (() => {
            const sub = Array.isArray(billingDetailCompany.subscription) ? billingDetailCompany.subscription[0] : billingDetailCompany.subscription;
            const createdAt = new Date(billingDetailCompany.created_at);
            const lifeTime = formatDistanceToNow(createdAt, { locale: ptBR, addSuffix: false });
            const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
            const lastPayment = sub?.last_payment_at ? new Date(sub.last_payment_at) : null;
            const trialStart = billingDetailCompany.trial_started_at ? new Date(billingDetailCompany.trial_started_at) : null;
            const trialEnd = billingDetailCompany.trial_ends_at ? new Date(billingDetailCompany.trial_ends_at) : null;
            const daysUntilDue = periodEnd ? Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

            const statusLabelsMap: Record<string, string> = {
              active: 'Em dia',
              trialing: 'Trial',
              past_due: 'Vencido',
              canceled: 'Cancelada',
              unpaid: 'Inadimplente',
            };

            return (
              <>
                <SheetHeader className="pb-4">
                  <SheetTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Detalhe Financeiro
                  </SheetTitle>
                  <SheetDescription>
                    {billingDetailCompany.name}
                  </SheetDescription>
                </SheetHeader>

                {/* Empresa */}
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Empresa</p>
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Criada em:</span>
                        <span className="font-medium">{createdAt.toLocaleDateString('pt-BR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tempo como cliente:</span>
                        <span className="font-medium">{lifeTime}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Plano:</span>
                        <span className="font-medium">{billingDetailCompany.plan?.name || '-'}</span>
                      </div>
                      {billingDetailCompany.plan?.price && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Valor/mês:</span>
                          <span className="font-medium text-green-600">
                            R$ {billingDetailCompany.plan.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Assinatura */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Assinatura Stripe</p>
                    {sub?.stripe_subscription_id ? (
                      <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Status:</span>
                          <Badge variant="outline" className={`text-xs ${
                            sub.status === 'active' ? 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400' :
                            sub.status === 'past_due' || sub.status === 'unpaid' ? 'bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400' :
                            sub.status === 'canceled' ? 'bg-gray-50 text-gray-600 border-gray-300' :
                            'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400'
                          }`}>
                            {statusLabelsMap[sub.status] || sub.status}
                          </Badge>
                        </div>
                        {lastPayment && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Último pagamento:</span>
                            <span className="font-medium">{lastPayment.toLocaleDateString('pt-BR')}</span>
                          </div>
                        )}
                        {periodEnd && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Próximo vencimento:</span>
                            <span className={`font-medium ${daysUntilDue !== null && daysUntilDue <= 5 && daysUntilDue >= 0 ? 'text-orange-600' : ''}`}>
                              {periodEnd.toLocaleDateString('pt-BR')}
                              {daysUntilDue !== null && daysUntilDue >= 0 && (
                                <span className="ml-1 text-muted-foreground font-normal">({daysUntilDue}d)</span>
                              )}
                            </span>
                          </div>
                        )}
                        {sub.stripe_subscription_id && (
                          <div className="flex justify-between items-center pt-1 border-t">
                            <span className="text-muted-foreground text-xs">ID Stripe:</span>
                            <code className="text-xs bg-muted px-1 rounded">{sub.stripe_subscription_id}</code>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                        Nenhuma assinatura ativa no Stripe.
                      </div>
                    )}
                  </div>

                  {/* Trial */}
                  {billingDetailCompany.trial_type && billingDetailCompany.trial_type !== 'none' && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Histórico de Trial</p>
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tipo:</span>
                            <span className="font-medium capitalize">
                              {billingDetailCompany.trial_type === 'manual' ? 'Manual' : 'Automático'}
                            </span>
                          </div>
                          {trialStart && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Início:</span>
                              <span className="font-medium">{trialStart.toLocaleDateString('pt-BR')}</span>
                            </div>
                          )}
                          {trialEnd && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Término:</span>
                              <span className={`font-medium ${trialEnd < new Date() ? 'text-red-600' : 'text-blue-600'}`}>
                                {trialEnd.toLocaleDateString('pt-BR')}
                                {trialEnd < new Date() ? ' (expirado)' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  <Separator />

                  {/* Ações */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Ações</p>
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => {
                        setBillingDetailCompany(null);
                        setBillingCompany(billingDetailCompany);
                        setBillingType("monthly");
                      }}
                      disabled={!billingDetailCompany.plan_id}
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      Gerar Cobrança Stripe
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
