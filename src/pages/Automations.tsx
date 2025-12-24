import { useState } from "react";
import {
  Plus,
  Zap,
  Bot,
  Webhook,
  Settings2,
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
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  triggerType: "new_conversation" | "keyword" | "scheduled" | "status_change";
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

  const toggleAutomation = (id: string) => {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isActive: !a.isActive } : a))
    );
  };

  const handleEdit = (automation: Automation) => {
    setEditingAutomation(automation);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingAutomation(null);
    setIsDialogOpen(true);
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
    
    // Simula geração de agente (aqui seria integração com IA real)
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

      {/* Tabs */}
      <Tabs defaultValue="automations">
        <TabsList>
          <TabsTrigger value="automations">
            <Zap className="h-4 w-4 mr-2" />
            Automações
          </TabsTrigger>
          <TabsTrigger value="whatsapp">
            <Settings2 className="h-4 w-4 mr-2" />
            WhatsApp / Evolution
          </TabsTrigger>
        </TabsList>

        <TabsContent value="automations" className="space-y-4 mt-6">
          {automations.map((automation) => (
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
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* AI Prompt Preview */}
                <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-dashed">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <Bot className="h-3 w-3" />
                    Prompt da IA
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {automation.aiPrompt}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Configuração Evolution API
              </CardTitle>
              <CardDescription>
                Configure a conexão com sua instância do Evolution API
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="evolution-url">URL da API</Label>
                  <Input
                    id="evolution-url"
                    placeholder="https://evolution.example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="evolution-key">API Key</Label>
                  <Input
                    id="evolution-key"
                    type="password"
                    placeholder="••••••••••••••••"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button>Salvar Configuração</Button>
                <Button variant="outline">Testar Conexão</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Instâncias WhatsApp</CardTitle>
              <CardDescription>
                Gerencie as instâncias de WhatsApp conectadas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <div className="text-center">
                  <Settings2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma instância configurada</p>
                  <p className="text-sm">Configure a Evolution API para adicionar instâncias</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  placeholder="Nome da automação"
                  defaultValue={editingAutomation?.name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trigger">Gatilho</Label>
                <Select defaultValue={editingAutomation?.triggerType || "new_conversation"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o gatilho" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_conversation">Nova conversa</SelectItem>
                    <SelectItem value="keyword">Palavra-chave</SelectItem>
                    <SelectItem value="scheduled">Agendado</SelectItem>
                    <SelectItem value="status_change">Mudança de status</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                placeholder="Descreva o objetivo desta automação"
                defaultValue={editingAutomation?.description}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook">URL do Webhook (n8n)</Label>
              <Input
                id="webhook"
                placeholder="https://n8n.example.com/webhook/..."
                defaultValue={editingAutomation?.webhookUrl}
              />
            </div>

            {/* AI Capabilities */}
            <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
              <Label className="text-base font-medium">Permissões do Agente IA</Label>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="can-status" className="text-sm font-normal">Pode alterar status</Label>
                  <Switch id="can-status" defaultChecked={editingAutomation?.canChangeStatus ?? true} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="can-dept" className="text-sm font-normal">Pode mover departamento</Label>
                  <Switch id="can-dept" defaultChecked={editingAutomation?.canMoveDepartment ?? true} />
                </div>
              </div>
              
              {statuses.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm">Status disponíveis para o agente:</Label>
                  <div className="flex flex-wrap gap-1">
                    {statuses.map((status) => (
                      <Badge
                        key={status.id}
                        variant="outline"
                        className="text-xs"
                        style={{ borderColor: status.color, color: status.color }}
                      >
                        {status.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {departments.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm">Departamentos disponíveis:</Label>
                  <div className="flex flex-wrap gap-1">
                    {departments.map((dept) => (
                      <Badge
                        key={dept.id}
                        variant="outline"
                        className="text-xs"
                        style={{ borderColor: dept.color, color: dept.color }}
                      >
                        {dept.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt da IA</Label>
              <Textarea
                id="prompt"
                placeholder="Instruções para a IA..."
                rows={4}
                defaultValue={editingAutomation?.aiPrompt}
              />
              <p className="text-xs text-muted-foreground">
                Lembre-se: A IA não pode fornecer aconselhamento jurídico, apenas triagem e coleta de informações.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setIsDialogOpen(false)}>
              {editingAutomation ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Agent Dialog */}
      <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Criar Agente de IA
            </DialogTitle>
            <DialogDescription>
              Descreva o que você quer que seu agente faça e nós configuramos automaticamente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="agent-description">Descreva seu agente</Label>
              <Textarea
                id="agent-description"
                placeholder="Ex: Quero um agente que faça a triagem inicial dos clientes, colete nome e telefone, identifique a área jurídica do caso e mova o cliente para o departamento correto..."
                rows={6}
                value={agentDescription}
                onChange={(e) => setAgentDescription(e.target.value)}
              />
            </div>

            <div className="p-4 rounded-lg bg-muted/50 border space-y-3">
              <h4 className="font-medium text-sm">O agente terá acesso a:</h4>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  {statuses.length > 0 ? `${statuses.length} status configurados` : "Nenhum status configurado"}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  {departments.length > 0 ? `${departments.length} departamentos` : "Nenhum departamento"}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Mover clientes entre departamentos
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Alterar status dos clientes
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-sm text-warning-foreground">
                <strong>Lembrete:</strong> O agente não fornecerá aconselhamento jurídico, apenas realizará triagem e coleta de informações.
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
                  <span className="animate-spin mr-2">⏳</span>
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
