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
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";

interface Automation {
  id: string;
  name: string;
  description: string;
  webhookUrl: string;
  triggerType: "new_conversation" | "keyword" | "scheduled" | "status_change" | "department_entry";
  triggerDepartmentId?: string;
  aiPrompt: string;
  isActive: boolean;
  lastTriggered: string | null;
  successCount: number;
  errorCount: number;
  canChangeStatus: boolean;
  canMoveDepartment: boolean;
}

const mockAutomations: Automation[] = [
  {
    id: "1",
    name: "Triagem Inicial",
    description: "Coleta informações básicas do cliente e classifica a área jurídica",
    webhookUrl: "https://n8n.example.com/webhook/triagem",
    triggerType: "new_conversation",
    aiPrompt: "Você é uma assistente jurídica. Colete nome, telefone e descreva brevemente o problema jurídico do cliente. Classifique em: Civil, Trabalhista, Família, Penal, Consumidor ou Empresarial.",
    isActive: true,
    lastTriggered: "2024-01-15T14:30:00",
    successCount: 156,
    errorCount: 3,
    canChangeStatus: true,
    canMoveDepartment: true,
  },
  {
    id: "2",
    name: "Qualificação de Leads",
    description: "Identifica potenciais clientes qualificados para atendimento prioritário",
    webhookUrl: "https://n8n.example.com/webhook/qualificacao",
    triggerType: "keyword",
    aiPrompt: "Analise a conversa e determine se o cliente tem um caso viável e urgente. Atribua uma pontuação de 1-10.",
    isActive: true,
    lastTriggered: "2024-01-15T12:00:00",
    successCount: 89,
    errorCount: 1,
    canChangeStatus: true,
    canMoveDepartment: false,
  },
];

const triggerTypeLabels = {
  new_conversation: "Nova conversa",
  keyword: "Palavra-chave",
  scheduled: "Agendado",
  status_change: "Mudança de status",
  department_entry: "Entrada em departamento",
};

export default function Automations() {
  const [automations, setAutomations] = useState<Automation[]>(mockAutomations);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [agentDescription, setAgentDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const { statuses } = useCustomStatuses();
  const { departments } = useDepartments();

  // Form states
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formWebhookUrl, setFormWebhookUrl] = useState("");
  const [formTriggerType, setFormTriggerType] = useState<Automation["triggerType"]>("new_conversation");
  const [formTriggerDepartmentId, setFormTriggerDepartmentId] = useState("");
  const [formAiPrompt, setFormAiPrompt] = useState("");
  const [formCanChangeStatus, setFormCanChangeStatus] = useState(true);
  const [formCanMoveDepartment, setFormCanMoveDepartment] = useState(true);

  const toggleAutomation = (id: string) => {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isActive: !a.isActive } : a))
    );
  };

  const handleEdit = (automation: Automation) => {
    setEditingAutomation(automation);
    setFormName(automation.name);
    setFormDescription(automation.description);
    setFormWebhookUrl(automation.webhookUrl);
    setFormTriggerType(automation.triggerType);
    setFormTriggerDepartmentId(automation.triggerDepartmentId || "");
    setFormAiPrompt(automation.aiPrompt);
    setFormCanChangeStatus(automation.canChangeStatus);
    setFormCanMoveDepartment(automation.canMoveDepartment);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingAutomation(null);
    setFormName("");
    setFormDescription("");
    setFormWebhookUrl("");
    setFormTriggerType("new_conversation");
    setFormTriggerDepartmentId("");
    setFormAiPrompt("");
    setFormCanChangeStatus(true);
    setFormCanMoveDepartment(true);
    setIsDialogOpen(true);
  };

  const handleSaveAutomation = () => {
    if (!formName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, informe um nome para a automação",
        variant: "destructive",
      });
      return;
    }

    // Validate webhook URL if provided
    if (formWebhookUrl.trim()) {
      try {
        const url = new URL(formWebhookUrl);
        if (url.protocol !== "https:") {
          toast({
            title: "URL inválida",
            description: "A URL do webhook deve usar HTTPS",
            variant: "destructive",
          });
          return;
        }
        // Check for internal IPs
        const hostname = url.hostname.toLowerCase();
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
          return;
        }
      } catch {
        toast({
          title: "URL inválida",
          description: "Por favor, informe uma URL válida",
          variant: "destructive",
        });
        return;
      }
    }

    if (formTriggerType === "department_entry" && !formTriggerDepartmentId) {
      toast({
        title: "Departamento obrigatório",
        description: "Selecione um departamento para o gatilho",
        variant: "destructive",
      });
      return;
    }

    const automation: Automation = {
      id: editingAutomation?.id || Date.now().toString(),
      name: formName,
      description: formDescription,
      webhookUrl: formWebhookUrl,
      triggerType: formTriggerType,
      triggerDepartmentId: formTriggerDepartmentId || undefined,
      aiPrompt: formAiPrompt,
      isActive: editingAutomation?.isActive ?? false,
      lastTriggered: editingAutomation?.lastTriggered ?? null,
      successCount: editingAutomation?.successCount ?? 0,
      errorCount: editingAutomation?.errorCount ?? 0,
      canChangeStatus: formCanChangeStatus,
      canMoveDepartment: formCanMoveDepartment,
    };

    if (editingAutomation) {
      setAutomations((prev) =>
        prev.map((a) => (a.id === editingAutomation.id ? automation : a))
      );
      toast({ title: "Automação atualizada" });
    } else {
      setAutomations((prev) => [...prev, automation]);
      toast({ title: "Automação criada" });
    }

    setIsDialogOpen(false);
  };

  const handleDeleteAutomation = (id: string) => {
    setAutomations((prev) => prev.filter((a) => a.id !== id));
    toast({ title: "Automação excluída" });
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
    
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    const newAutomation: Automation = {
      id: Date.now().toString(),
      name: `Agente: ${agentDescription.slice(0, 30)}...`,
      description: agentDescription,
      webhookUrl: "",
      triggerType: "new_conversation",
      aiPrompt: `Você é um assistente jurídico inteligente. Sua função é: ${agentDescription}\n\nVocê pode:\n- Acessar e modificar o status dos clientes\n- Mover clientes entre departamentos\n- Coletar informações importantes\n\nSempre seja educado e profissional. Não forneça aconselhamento jurídico, apenas triagem e coleta de informações.`,
      isActive: false,
      lastTriggered: null,
      successCount: 0,
      errorCount: 0,
      canChangeStatus: true,
      canMoveDepartment: true,
    };

    setAutomations((prev) => [...prev, newAutomation]);
    setIsGenerating(false);
    setIsAgentDialogOpen(false);
    
    toast({
      title: "Agente criado com sucesso!",
      description: "Seu agente foi configurado. Ative-o quando estiver pronto.",
    });
  };

  const getDepartmentName = (id: string) => {
    const dept = departments.find((d) => d.id === id);
    return dept?.name || "Departamento";
  };

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

      {/* Info Card */}
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
          Automações Ativas
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
                        automation.isActive
                          ? "bg-success/10"
                          : "bg-muted"
                      )}
                    >
                      <Zap
                        className={cn(
                          "h-6 w-6",
                          automation.isActive
                            ? "text-success"
                            : "text-muted-foreground"
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{automation.name}</h3>
                        <Badge variant="outline" className="text-xs">
                          {triggerTypeLabels[automation.triggerType]}
                        </Badge>
                        {automation.triggerType === "department_entry" && automation.triggerDepartmentId && (
                          <Badge variant="secondary" className="text-xs">
                            <Folder className="h-3 w-3 mr-1" />
                            {getDepartmentName(automation.triggerDepartmentId)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {automation.description}
                      </p>
                      <div className="flex items-center gap-4 mt-3">
                        {automation.webhookUrl && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Webhook className="h-3 w-3" />
                            <span className="truncate max-w-48">{automation.webhookUrl}</span>
                          </div>
                        )}
                      </div>
                      {/* Capabilities badges */}
                      <div className="flex gap-2 mt-2">
                        {automation.canChangeStatus && (
                          <Badge variant="secondary" className="text-xs">
                            Altera status
                          </Badge>
                        )}
                        {automation.canMoveDepartment && (
                          <Badge variant="secondary" className="text-xs">
                            Move departamento
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right space-y-1">
                      <div className="flex items-center gap-2 justify-end">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span className="text-sm font-medium">{automation.successCount}</span>
                        {automation.errorCount > 0 && (
                          <>
                            <AlertCircle className="h-4 w-4 text-destructive ml-2" />
                            <span className="text-sm font-medium text-destructive">
                              {automation.errorCount}
                            </span>
                          </>
                        )}
                      </div>
                      {automation.lastTriggered && (
                        <p className="text-xs text-muted-foreground">
                          Último: {new Date(automation.lastTriggered).toLocaleString("pt-BR")}
                        </p>
                      )}
                    </div>

                    <Switch
                      checked={automation.isActive}
                      onCheckedChange={() => toggleAutomation(automation.id)}
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
                        <DropdownMenuItem>
                          <Play className="h-4 w-4 mr-2" />
                          Testar
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Abrir n8n
                        </DropdownMenuItem>
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
                {automation.aiPrompt && (
                  <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-dashed">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <Bot className="h-3 w-3" />
                      Prompt da IA
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {automation.aiPrompt}
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
        <DialogContent className="max-w-2xl">
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
                <Label htmlFor="name">Nome da automação</Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Triagem Inicial"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trigger">Gatilho</Label>
                <Select value={formTriggerType} onValueChange={(v) => setFormTriggerType(v as Automation["triggerType"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_conversation">Nova conversa</SelectItem>
                    <SelectItem value="keyword">Palavra-chave</SelectItem>
                    <SelectItem value="scheduled">Agendado</SelectItem>
                    <SelectItem value="status_change">Mudança de status</SelectItem>
                    <SelectItem value="department_entry">Entrada em departamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formTriggerType === "department_entry" && (
              <div className="space-y-2">
                <Label htmlFor="department">Departamento</Label>
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
              <Label htmlFor="webhook">URL do Webhook (n8n)</Label>
              <Input
                id="webhook"
                value={formWebhookUrl}
                onChange={(e) => setFormWebhookUrl(e.target.value)}
                placeholder="https://n8n.example.com/webhook/..."
              />
              <p className="text-xs text-muted-foreground">
                Apenas URLs HTTPS são permitidas por segurança
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt da IA</Label>
              <Textarea
                id="prompt"
                value={formAiPrompt}
                onChange={(e) => setFormAiPrompt(e.target.value)}
                placeholder="Descreva como a IA deve se comportar..."
                rows={4}
              />
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
            <Button onClick={handleSaveAutomation}>
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAgentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={generateAgentFromDescription} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
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
