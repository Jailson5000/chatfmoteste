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
import { Plus, MoreHorizontal, Search, Building2, Pencil, Trash2, ExternalLink, Globe, Settings, RefreshCw, Workflow, AlertCircle, CheckCircle2, Clock, Copy, Link, Play, Server, Zap, Activity, Heart, Mail, MailX, Send, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useCompanies } from "@/hooks/useCompanies";
import { usePlans } from "@/hooks/usePlans";
import { DomainConfigDialog } from "@/components/global-admin/DomainConfigDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

function generateSubdomainFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
}

export default function GlobalAdminCompanies() {
  const { companies, isLoading, createCompany, updateCompany, deleteCompany, retryN8nWorkflow, runHealthCheck, retryAllFailedWorkflows, resendInitialAccess } = useCompanies();
  const { plans } = usePlans();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<string | null>(null);
  const [domainConfigCompany, setDomainConfigCompany] = useState<typeof companies[0] | null>(null);
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);

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
    subdomain: "",
    auto_activate_workflow: true,
    admin_name: "",
    admin_email: "",
  });

  const filteredCompanies = companies.filter(
    (company) =>
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.law_firm?.subdomain?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleNameChange = (value: string) => {
    const newSubdomain = generateSubdomainFromName(value);
    setFormData({ 
      ...formData, 
      name: value, 
      subdomain: formData.subdomain || newSubdomain 
    });
  };

  const handleCreate = async () => {
    await createCompany.mutateAsync({
      ...formData,
      auto_activate_workflow: formData.auto_activate_workflow,
      admin_name: formData.admin_name || undefined,
      admin_email: formData.admin_email || undefined,
    });
    setIsCreateDialogOpen(false);
    setFormData({ name: "", document: "", email: "", phone: "", plan_id: "", max_users: 5, max_instances: 2, subdomain: "", auto_activate_workflow: true, admin_name: "", admin_email: "" });
  };

  const handleUpdate = async () => {
    if (!editingCompany) return;
    await updateCompany.mutateAsync({ id: editingCompany, ...formData });
    setEditingCompany(null);
    setFormData({ name: "", document: "", email: "", phone: "", plan_id: "", max_users: 5, max_instances: 2, subdomain: "", auto_activate_workflow: true, admin_name: "", admin_email: "" });
  };

  const handleDelete = async (company: typeof companies[0]) => {
    if (confirm("Tem certeza que deseja excluir esta empresa? O workflow n8n também será removido.")) {
      await deleteCompany.mutateAsync(company);
    }
  };

  const openEditDialog = (company: typeof companies[0]) => {
    setFormData({
      name: company.name,
      document: company.document || "",
      email: company.email || "",
      phone: company.phone || "",
      plan_id: company.plan_id || "",
      max_users: company.max_users,
      max_instances: company.max_instances,
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
                    <Label htmlFor="name">Nome da Empresa</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Nome da empresa"
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
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">.miauchat.com.br</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Este será o endereço de acesso: https://{formData.subdomain || 'empresa'}.miauchat.com.br
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="document">CNPJ/CPF</Label>
                      <Input
                        id="document"
                        value={formData.document}
                        onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                        placeholder="00.000.000/0000-00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="contato@empresa.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan">Plano</Label>
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
                      <Label htmlFor="max_users">Máx. Usuários</Label>
                      <Input
                        id="max_users"
                        type="number"
                        value={formData.max_users}
                        onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max_instances">Máx. Conexões</Label>
                      <Input
                        id="max_instances"
                        type="number"
                        value={formData.max_instances}
                        onChange={(e) => setFormData({ ...formData, max_instances: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                  
                  {/* Admin User Section */}
                  <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                    <p className="text-sm font-medium">Administrador da Empresa</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="admin_name">Nome do Admin</Label>
                        <Input
                          id="admin_name"
                          value={formData.admin_name}
                          onChange={(e) => setFormData({ ...formData, admin_name: e.target.value })}
                          placeholder="Nome completo"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="admin_email">Email do Admin</Label>
                        <Input
                          id="admin_email"
                          type="email"
                          value={formData.admin_email}
                          onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                          placeholder="admin@empresa.com"
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

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar empresas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Lista de Empresas
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
                {filteredCompanies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Nenhuma empresa encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCompanies.map((company) => (
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
                        {company.plan?.name || "-"}
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
    </div>
  );
}
