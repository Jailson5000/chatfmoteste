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
import { Plus, MoreHorizontal, Search, Building2, Pencil, Trash2, ExternalLink, Globe, Settings, RefreshCw, Workflow, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { useCompanies } from "@/hooks/useCompanies";
import { usePlans } from "@/hooks/usePlans";
import { DomainConfigDialog } from "@/components/global-admin/DomainConfigDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const { companies, isLoading, createCompany, updateCompany, deleteCompany, retryN8nWorkflow } = useCompanies();
  const { plans } = usePlans();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<string | null>(null);
  const [domainConfigCompany, setDomainConfigCompany] = useState<typeof companies[0] | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    document: "",
    email: "",
    phone: "",
    plan_id: "",
    max_users: 5,
    max_instances: 2,
    subdomain: "",
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
    await createCompany.mutateAsync(formData);
    setIsCreateDialogOpen(false);
    setFormData({ name: "", document: "", email: "", phone: "", plan_id: "", max_users: 5, max_instances: 2, subdomain: "" });
  };

  const handleUpdate = async () => {
    if (!editingCompany) return;
    await updateCompany.mutateAsync({ id: editingCompany, ...formData });
    setEditingCompany(null);
    setFormData({ name: "", document: "", email: "", phone: "", plan_id: "", max_users: 5, max_instances: 2, subdomain: "" });
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta empresa?")) {
      await deleteCompany.mutateAsync(id);
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
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nova Empresa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Empresa</DialogTitle>
              <DialogDescription>
                Preencha os dados para cadastrar uma nova empresa
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
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
            </div>
            <DialogFooter>
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
                  <TableHead>Workflow n8n</TableHead>
                  <TableHead>Usuários</TableHead>
                  <TableHead>Conexões</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
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
                          <div className="flex items-center gap-2">
                            {company.n8n_workflow_status === 'created' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1 text-green-600">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span className="text-xs">{company.n8n_workflow_id?.slice(0, 8)}...</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">{company.n8n_workflow_name}</p>
                                  <p className="text-xs text-muted-foreground">ID: {company.n8n_workflow_id}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {company.n8n_workflow_status === 'pending' && (
                              <div className="flex items-center gap-1 text-yellow-600">
                                <Clock className="h-4 w-4 animate-pulse" />
                                <span className="text-xs">Criando...</span>
                              </div>
                            )}
                            {company.n8n_workflow_status === 'failed' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1 text-destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <span className="text-xs">Falhou</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">Erro ao criar workflow</p>
                                  <p className="text-xs text-muted-foreground">{company.n8n_last_error}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {(!company.n8n_workflow_status || company.n8n_workflow_status === 'failed') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => retryN8nWorkflow.mutate(company)}
                                disabled={retryN8nWorkflow.isPending}
                                className="h-7 px-2"
                              >
                                <RefreshCw className={`h-3 w-3 mr-1 ${retryN8nWorkflow.isPending ? 'animate-spin' : ''}`} />
                                <span className="text-xs">Criar</span>
                              </Button>
                            )}
                          </div>
                        </TooltipProvider>
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
                              onClick={() => handleDelete(company.id)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
          <DialogFooter>
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
