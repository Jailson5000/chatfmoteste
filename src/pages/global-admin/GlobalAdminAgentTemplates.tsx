import { useState } from "react";
import {
  Bot,
  Calendar,
  Eye,
  EyeOff,
  FileText,
  Headphones,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  ShoppingCart,
  Star,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useAgentTemplates, AgentTemplate } from "@/hooks/useAgentTemplates";
import { cn } from "@/lib/utils";

const iconOptions = [
  { value: "bot", label: "Robô", icon: Bot },
  { value: "calendar", label: "Calendário", icon: Calendar },
  { value: "headphones", label: "Atendimento", icon: Headphones },
  { value: "shopping-cart", label: "Vendas", icon: ShoppingCart },
  { value: "message-square", label: "Chat", icon: MessageSquare },
  { value: "file-text", label: "Documentos", icon: FileText },
];

const categoryOptions = [
  { value: "geral", label: "Geral" },
  { value: "agendamento", label: "Agendamento" },
  { value: "atendimento", label: "Atendimento" },
  { value: "vendas", label: "Vendas" },
  { value: "suporte", label: "Suporte" },
];

export default function GlobalAdminAgentTemplates() {
  const { allTemplates, isLoadingAll, createTemplate, updateTemplate, deleteTemplate } = useAgentTemplates();
  
  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AgentTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<AgentTemplate | null>(null);
  
  // Form states
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIcon, setFormIcon] = useState("bot");
  const [formCategory, setFormCategory] = useState("geral");
  const [formPrompt, setFormPrompt] = useState("");
  const [formIsFeatured, setFormIsFeatured] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formVoiceEnabled, setFormVoiceEnabled] = useState(false);

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormIcon("bot");
    setFormCategory("geral");
    setFormPrompt("");
    setFormIsFeatured(false);
    setFormIsActive(true);
    setFormVoiceEnabled(false);
  };

  const openEditDialog = (template: AgentTemplate) => {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormDescription(template.description || "");
    setFormIcon(template.icon);
    setFormCategory(template.category);
    setFormPrompt(template.ai_prompt);
    setFormIsFeatured(template.is_featured);
    setFormIsActive(template.is_active);
    setFormVoiceEnabled(template.voice_enabled);
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formPrompt.trim()) return;

    await createTemplate.mutateAsync({
      name: formName,
      description: formDescription || null,
      icon: formIcon,
      category: formCategory,
      ai_prompt: formPrompt,
      is_featured: formIsFeatured,
      is_active: formIsActive,
      voice_enabled: formVoiceEnabled,
      trigger_type: "message_received",
    });

    setIsCreateDialogOpen(false);
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingTemplate || !formName.trim() || !formPrompt.trim()) return;

    await updateTemplate.mutateAsync({
      id: editingTemplate.id,
      name: formName,
      description: formDescription || null,
      icon: formIcon,
      category: formCategory,
      ai_prompt: formPrompt,
      is_featured: formIsFeatured,
      is_active: formIsActive,
      voice_enabled: formVoiceEnabled,
    });

    setEditingTemplate(null);
    resetForm();
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;

    await deleteTemplate.mutateAsync(templateToDelete.id);
    setTemplateToDelete(null);
  };

  const toggleActive = async (template: AgentTemplate) => {
    await updateTemplate.mutateAsync({
      id: template.id,
      is_active: !template.is_active,
    });
  };

  const toggleFeatured = async (template: AgentTemplate) => {
    await updateTemplate.mutateAsync({
      id: template.id,
      is_featured: !template.is_featured,
    });
  };

  const getIcon = (iconName: string) => {
    const found = iconOptions.find(o => o.value === iconName);
    return found?.icon || Bot;
  };

  if (isLoadingAll) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Templates de Agentes</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os templates de agentes disponíveis para as empresas
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Template
        </Button>
      </div>

      {/* Templates Table */}
      <Card>
        <CardHeader>
          <CardTitle>Templates Disponíveis</CardTitle>
          <CardDescription>
            {allTemplates.length} template{allTemplates.length !== 1 ? "s" : ""} cadastrado{allTemplates.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allTemplates.length === 0 ? (
            <div className="text-center py-12">
              <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium text-lg mb-1">Nenhum template criado</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Crie templates de agentes para as empresas usarem
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Template
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Destaque</TableHead>
                  <TableHead className="text-center">Usos</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allTemplates.map((template) => {
                  const Icon = getIcon(template.icon);
                  return (
                    <TableRow key={template.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <span className="font-medium">{template.name}</span>
                            {template.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                                {template.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {categoryOptions.find(c => c.value === template.category)?.label || template.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          onClick={() => toggleActive(template)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors",
                            template.is_active 
                              ? "bg-green-500/10 text-green-600 hover:bg-green-500/20" 
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          )}
                        >
                          {template.is_active ? (
                            <>
                              <Eye className="h-3 w-3" />
                              Ativo
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3" />
                              Inativo
                            </>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          onClick={() => toggleFeatured(template)}
                          className={cn(
                            "p-1.5 rounded-full transition-colors",
                            template.is_featured 
                              ? "text-amber-500 hover:bg-amber-500/10" 
                              : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          <Star className={cn("h-4 w-4", template.is_featured && "fill-amber-500")} />
                        </button>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-muted-foreground">
                          {template.usage_count || 0}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(template)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => setTemplateToDelete(template)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog 
        open={isCreateDialogOpen || !!editingTemplate} 
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingTemplate(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Editar Template" : "Novo Template de Agente"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate 
                ? "Altere as configurações do template" 
                : "Crie um template que poderá ser usado pelas empresas"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Nome *</Label>
                <Input
                  id="template-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Agente de Agendamento"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-icon">Ícone</Label>
                <Select value={formIcon} onValueChange={setFormIcon}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {iconOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {option.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-description">Descrição</Label>
              <Textarea
                id="template-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descreva a função do template..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="template-category">Categoria</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Opções</Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 border rounded-lg">
                    <span className="text-sm">Destaque</span>
                    <Switch checked={formIsFeatured} onCheckedChange={setFormIsFeatured} />
                  </div>
                  <div className="flex items-center justify-between p-2 border rounded-lg">
                    <span className="text-sm">Voz IA</span>
                    <Switch checked={formVoiceEnabled} onCheckedChange={setFormVoiceEnabled} />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-prompt">Prompt da IA *</Label>
              <Textarea
                id="template-prompt"
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
                placeholder="Digite o prompt que define o comportamento do agente..."
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{nome_contato}}"} para o nome do contato e {"{{nome_empresa}}"} para o nome da empresa.
              </p>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div>
                <span className="font-medium text-sm">Template Ativo</span>
                <p className="text-xs text-muted-foreground">
                  Templates inativos não aparecem para as empresas
                </p>
              </div>
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsCreateDialogOpen(false);
                setEditingTemplate(null);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={editingTemplate ? handleUpdate : handleCreate}
              disabled={!formName.trim() || !formPrompt.trim() || createTemplate.isPending || updateTemplate.isPending}
            >
              {(createTemplate.isPending || updateTemplate.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingTemplate ? "Salvar" : "Criar Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!templateToDelete} onOpenChange={() => setTemplateToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Template</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o template "{templateToDelete?.name}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTemplate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
