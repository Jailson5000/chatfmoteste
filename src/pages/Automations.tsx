import { useState } from "react";
import {
  Plus,
  Zap,
  Bot,
  Webhook,
  MoreVertical,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Play,
  ExternalLink,
  Sparkles,
  MessageSquare,
  ArrowRight,
  Wand2,
  Folder,
  Loader2,
  TestTube,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { cn } from "@/lib/utils";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useDepartments } from "@/hooks/useDepartments";
import { useAutomations, type Automation, type CreateAutomationParams } from "@/hooks/useAutomations";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

type TriggerType = "new_conversation" | "keyword" | "scheduled" | "status_change" | "department_entry";

const triggerTypeLabels: Record<TriggerType, string> = {
  new_conversation: "Nova conversa",
  keyword: "Palavra-chave",
  scheduled: "Agendado",
  status_change: "Mudança de status",
  department_entry: "Entrada em departamento",
};

export default function Automations() {
  const { 
    automations, 
    isLoading, 
    createAutomation, 
    updateAutomation, 
    deleteAutomation, 
    toggleAutomation,
    testWebhook 
  } = useAutomations();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [agentDescription, setAgentDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const { departments } = useDepartments();

  // Form states
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formWebhookUrl, setFormWebhookUrl] = useState("");
  const [formTriggerType, setFormTriggerType] = useState<TriggerType>("new_conversation");
  const [formTriggerDepartmentId, setFormTriggerDepartmentId] = useState("");
  const [formKeywords, setFormKeywords] = useState("");
  const [formAiPrompt, setFormAiPrompt] = useState("");
  const [formCanChangeStatus, setFormCanChangeStatus] = useState(true);
  const [formCanMoveDepartment, setFormCanMoveDepartment] = useState(true);

  const handleToggleAutomation = (id: string, currentState: boolean) => {
    toggleAutomation.mutate({ id, is_active: !currentState });
  };

  const handleEdit = (automation: Automation) => {
    setEditingAutomation(automation);
    setFormName(automation.name);
    setFormDescription(automation.description || "");
    setFormWebhookUrl(automation.webhook_url);
    setFormTriggerType(automation.trigger_type as TriggerType);
    setFormTriggerDepartmentId(automation.trigger_config?.departmentId || "");
    setFormKeywords(automation.trigger_config?.keywords?.join(", ") || "");
    setFormAiPrompt(automation.ai_prompt || "");
    setFormCanChangeStatus(automation.trigger_config?.canChangeStatus ?? true);
    setFormCanMoveDepartment(automation.trigger_config?.canMoveDepartment ?? true);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingAutomation(null);
    setFormName("");
    setFormDescription("");
    setFormWebhookUrl("");
    setFormTriggerType("new_conversation");
    setFormTriggerDepartmentId("");
    setFormKeywords("");
    setFormAiPrompt("");
    setFormCanChangeStatus(true);
    setFormCanMoveDepartment(true);
    setIsDialogOpen(true);
  };

  const validateWebhookUrl = (url: string): boolean => {
    if (!url.trim()) return true; // Allow empty for now

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") {
        toast({
          title: "URL inválida",
          description: "A URL do webhook deve usar HTTPS",
          variant: "destructive",
        });
        return false;
      }
      
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname.startsWith("127.") ||
        hostname.startsWith("10.") ||
        hostname.startsWith("172.16.") ||
        hostname.startsWith("172.17.") ||
        hostname.startsWith("172.18.") ||
        hostname.startsWith("192.168.") ||
        hostname === "0.0.0.0"
      ) {
        toast({
          title: "URL inválida",
          description: "URLs de rede interna não são permitidas",
          variant: "destructive",
        });
        return false;
      }
      return true;
    } catch {
      toast({
        title: "URL inválida",
        description: "Por favor, informe uma URL válida",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleSaveAutomation = async () => {
    if (!formName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, informe um nome para a automação",
        variant: "destructive",
      });
      return;
    }

    if (!formWebhookUrl.trim()) {
      toast({
        title: "Webhook obrigatório",
        description: "Por favor, informe a URL do webhook do n8n",
        variant: "destructive",
      });
      return;
    }

    if (!validateWebhookUrl(formWebhookUrl)) return;

    if (formTriggerType === "department_entry" && !formTriggerDepartmentId) {
      toast({
        title: "Departamento obrigatório",
        description: "Selecione um departamento para o gatilho",
        variant: "destructive",
      });
      return;
    }

    const triggerConfig: Record<string, unknown> = {
      canChangeStatus: formCanChangeStatus,
      canMoveDepartment: formCanMoveDepartment,
    };

    if (formTriggerType === "department_entry" && formTriggerDepartmentId) {
      triggerConfig.departmentId = formTriggerDepartmentId;
    }

    if (formTriggerType === "keyword" && formKeywords.trim()) {
      triggerConfig.keywords = formKeywords.split(",").map(k => k.trim()).filter(Boolean);
    }

    const params: CreateAutomationParams = {
      name: formName,
      description: formDescription || undefined,
      webhook_url: formWebhookUrl,
      trigger_type: formTriggerType,
      trigger_config: triggerConfig,
      ai_prompt: formAiPrompt || undefined,
    };

    if (editingAutomation) {
      updateAutomation.mutate({ id: editingAutomation.id, ...params });
    } else {
      createAutomation.mutate(params);
    }

    setIsDialogOpen(false);
  };

  const handleDeleteAutomation = (id: string) => {
    deleteAutomation.mutate(id);
  };

  const handleTestWebhook = (webhookUrl: string) => {
    testWebhook.mutate(webhookUrl);
  };

  const handleCreateAgent = () => {
    setAgentDescription("");
    setIsAgentDialogOpen(true);
  };

  const generateAgentFromDescription = async () => {
    if (!agentDescription.trim()) {
      toast({
        title: "Descrição necessária",
        description: "Por favor, descreva o que você quer que o agente faça.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    // Generate agent configuration
    const params: CreateAutomationParams = {
      name: `Agente: ${agentDescription.slice(0, 30)}${agentDescription.length > 30 ? '...' : ''}`,
      description: agentDescription,
      webhook_url: "",
      trigger_type: "new_conversation",
      trigger_config: {
        canChangeStatus: true,
        canMoveDepartment: true,
      },
      ai_prompt: `Você é um assistente jurídico inteligente. Sua função é: ${agentDescription}

Você pode:
- Acessar e modificar o status dos clientes
- Mover clientes entre departamentos
- Coletar informações importantes

REGRAS IMPORTANTES:
- Sempre seja educado e profissional
- NÃO forneça aconselhamento jurídico, apenas triagem e coleta de informações
- Quando identificar um caso complexo ou urgente, sinalize para atendimento humano
- Sempre colete: nome completo, telefone, descrição do problema
- Classifique o tipo de caso: Civil, Trabalhista, Família, Penal, Consumidor, Empresarial ou Outros`,
      is_active: false,
    };

    createAutomation.mutate(params, {
      onSuccess: () => {
        setIsGenerating(false);
        setIsAgentDialogOpen(false);
        toast({
          title: "Agente criado com sucesso!",
          description: "Configure o webhook do n8n e ative o agente quando estiver pronto.",
        });
      },
      onError: () => {
        setIsGenerating(false);
      },
    });
  };

  const getDepartmentName = (id: string) => {
    const dept = departments.find((d) => d.id === id);
    return dept?.name || "Departamento";
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Automações</h1>
          <p className="text-muted-foreground mt-1">
            Configure integrações com n8n e IA para automatizar atendimentos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Automação
          </Button>
          <Button onClick={handleCreateAgent} className="bg-gradient-to-r from-primary to-primary/80">
            <Sparkles className="h-4 w-4 mr-2" />
            Criar Agente IA
          </Button>
        </div>
      </div>

      {/* Agent Creation Card */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/20">
              <Wand2 className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1 space-y-2">
              <h3 className="font-semibold text-lg">Crie seu Agente de IA</h3>
              <p className="text-sm text-muted-foreground">
                Descreva o que você quer que seu agente faça e nós configuramos tudo automaticamente.
                O agente pode acessar status, mover clientes entre departamentos e muito mais.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant="secondary" className="text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Acessa status
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  <ArrowRight className="h-3 w-3 mr-1" />
                  Move departamentos
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Responde clientes
                </Badge>
              </div>
            </div>
            <Button onClick={handleCreateAgent} size="lg">
              <Sparkles className="h-4 w-4 mr-2" />
              Começar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info Card - n8n Integration */}
      <Card className="bg-muted/50 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Webhook className="h-6 w-6 text-orange-500" />
            </div>
            <div className="space-y-1 flex-1">
              <h3 className="font-medium">Integração com n8n</h3>
              <p className="text-sm text-muted-foreground">
                As automações funcionam através do n8n. Configure seu workflow no n8n e cole a URL do webhook aqui.
                O sistema envia as mensagens para o n8n, que processa com IA e retorna a resposta.
              </p>
              <div className="flex gap-2 mt-2">
                <Badge variant="outline" className="text-xs">
                  WhatsApp → Backend → n8n → IA → Backend → WhatsApp
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Limitações */}
      <Card className="bg-muted/50 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="font-medium">Limitações da IA Jurídica</h3>
              <p className="text-sm text-muted-foreground">
                A IA só pode realizar triagem, coleta de informações e classificação de casos.
                <strong> Não fornece aconselhamento jurídico</strong> e sempre encaminha para advogado humano.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Automations List */}
      <div className="space-y-4">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Automações ({automations.length})
        </h2>

        {automations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Zap className="h-16 w-16 mb-4 opacity-50" />
              <p className="font-medium mb-1">Nenhuma automação configurada</p>
              <p className="text-sm text-center">
                Clique em "Nova Automação" ou "Criar Agente IA" para começar
              </p>
            </CardContent>
          </Card>
        ) : (
          automations.map((automation) => (
            <Card key={automation.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "p-3 rounded-xl",
                        automation.is_active ? "bg-success/10" : "bg-muted"
                      )}
                    >
                      <Zap
                        className={cn(
                          "h-6 w-6",
                          automation.is_active ? "text-success" : "text-muted-foreground"
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{automation.name}</h3>
                        <Badge variant="outline" className="text-xs">
                          {triggerTypeLabels[automation.trigger_type as TriggerType] || automation.trigger_type}
                        </Badge>
                        {automation.trigger_type === "department_entry" && automation.trigger_config?.departmentId && (
                          <Badge variant="secondary" className="text-xs">
                            <Folder className="h-3 w-3 mr-1" />
                            {getDepartmentName(automation.trigger_config.departmentId)}
                          </Badge>
                        )}
                        {!automation.webhook_url && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Webhook não configurado
                          </Badge>
                        )}
                      </div>
                      {automation.description && (
                        <p className="text-sm text-muted-foreground">
                          {automation.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-3">
                        {automation.webhook_url && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Webhook className="h-3 w-3" />
                            <span className="truncate max-w-48">{automation.webhook_url}</span>
                          </div>
                        )}
                      </div>
                      {/* Capabilities badges */}
                      <div className="flex gap-2 mt-2">
                        {automation.trigger_config?.canChangeStatus && (
                          <Badge variant="secondary" className="text-xs">
                            Altera status
                          </Badge>
                        )}
                        {automation.trigger_config?.canMoveDepartment && (
                          <Badge variant="secondary" className="text-xs">
                            Move departamento
                          </Badge>
                        )}
                        {automation.trigger_config?.keywords && automation.trigger_config.keywords.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            Palavras-chave: {automation.trigger_config.keywords.join(", ")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <Switch
                      checked={automation.is_active}
                      onCheckedChange={() => handleToggleAutomation(automation.id, automation.is_active)}
                      disabled={toggleAutomation.isPending}
                    />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-5 w-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(automation)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        {automation.webhook_url && (
                          <DropdownMenuItem onClick={() => handleTestWebhook(automation.webhook_url)}>
                            <TestTube className="h-4 w-4 mr-2" />
                            Testar Webhook
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDeleteAutomation(automation.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* AI Prompt Preview */}
                {automation.ai_prompt && (
                  <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-dashed">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <Bot className="h-3 w-3" />
                      Prompt da IA
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {automation.ai_prompt}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Automation Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAutomation ? "Editar Automação" : "Nova Automação"}
            </DialogTitle>
            <DialogDescription>
              Configure os parâmetros da automação e o prompt da IA
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da automação *</Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Triagem Inicial"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trigger">Gatilho</Label>
                <Select value={formTriggerType} onValueChange={(v) => setFormTriggerType(v as TriggerType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_conversation">Nova conversa</SelectItem>
                    <SelectItem value="keyword">Palavra-chave</SelectItem>
                    <SelectItem value="department_entry">Entrada em departamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formTriggerType === "department_entry" && (
              <div className="space-y-2">
                <Label htmlFor="department">Departamento *</Label>
                <Select value={formTriggerDepartmentId} onValueChange={setFormTriggerDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: dept.color }}
                          />
                          {dept.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A automação será disparada quando um cliente entrar neste departamento
                </p>
              </div>
            )}

            {formTriggerType === "keyword" && (
              <div className="space-y-2">
                <Label htmlFor="keywords">Palavras-chave</Label>
                <Input
                  id="keywords"
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                  placeholder="Ex: urgente, ajuda, preciso"
                />
                <p className="text-xs text-muted-foreground">
                  Separe as palavras-chave por vírgula
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descrição breve da automação"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook">URL do Webhook (n8n) *</Label>
              <Input
                id="webhook"
                value={formWebhookUrl}
                onChange={(e) => setFormWebhookUrl(e.target.value)}
                placeholder="https://seu-n8n.com/webhook/..."
              />
              <p className="text-xs text-muted-foreground">
                Cole aqui a URL do webhook do seu workflow n8n. Apenas URLs HTTPS são permitidas.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt da IA (enviado ao n8n)</Label>
              <Textarea
                id="prompt"
                value={formAiPrompt}
                onChange={(e) => setFormAiPrompt(e.target.value)}
                placeholder="Descreva como a IA deve se comportar..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Este prompt será enviado ao n8n junto com as mensagens para contexto da IA
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <Label>Pode alterar status</Label>
                  <p className="text-xs text-muted-foreground">
                    Permite que a IA mude o status do cliente
                  </p>
                </div>
                <Switch
                  checked={formCanChangeStatus}
                  onCheckedChange={setFormCanChangeStatus}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <Label>Pode mover departamento</Label>
                  <p className="text-xs text-muted-foreground">
                    Permite que a IA transfira o cliente
                  </p>
                </div>
                <Switch
                  checked={formCanMoveDepartment}
                  onCheckedChange={setFormCanMoveDepartment}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveAutomation}
              disabled={createAutomation.isPending || updateAutomation.isPending}
            >
              {(createAutomation.isPending || updateAutomation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingAutomation ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Agent Dialog */}
      <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Criar Agente de IA
            </DialogTitle>
            <DialogDescription>
              Descreva o que você quer que o agente faça. Nós configuramos o resto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="agent-description">O que seu agente deve fazer?</Label>
              <Textarea
                id="agent-description"
                value={agentDescription}
                onChange={(e) => setAgentDescription(e.target.value)}
                placeholder="Ex: Fazer a triagem inicial dos clientes, coletar dados básicos (nome, telefone, descrição do problema) e classificar o tipo de caso jurídico."
                rows={5}
              />
            </div>

            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <h4 className="font-medium text-sm">O agente poderá:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Responder automaticamente os clientes
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Alterar o status dos atendimentos
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Mover clientes entre departamentos
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Coletar e organizar informações
                </li>
              </ul>
            </div>

            <div className="rounded-lg bg-orange-500/10 p-4 space-y-2">
              <h4 className="font-medium text-sm text-orange-500">Próximo passo:</h4>
              <p className="text-sm text-muted-foreground">
                Após criar o agente, você precisará configurar o webhook do n8n e criar o workflow de IA.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAgentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={generateAgentFromDescription} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Criar Agente
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
