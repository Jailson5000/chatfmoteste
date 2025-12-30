import { useState, useEffect } from "react";
import { 
  ArrowLeft, 
  Save, 
  Clock, 
  Database, 
  Key, 
  MessageSquare, 
  Settings2, 
  Power,
  ChevronDown,
  Check,
  AlertCircle,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useAutomations } from "@/hooks/useAutomations";
import { useKnowledgeItems } from "@/hooks/useKnowledgeItems";
import { useWhatsAppInstances } from "@/hooks/useWhatsAppInstances";
import { useDepartments } from "@/hooks/useDepartments";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const MAX_PROMPT_LENGTH = 5000;

type ChannelType = "all" | "instance" | "department";

export default function AdminAIConfig() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { automations, isLoading: automationsLoading, updateAutomation, createAutomation } = useAutomations();
  const { knowledgeItems, isLoading: knowledgeLoading } = useKnowledgeItems();
  const { instances, isLoading: instancesLoading } = useWhatsAppInstances();
  const { departments, isLoading: departmentsLoading } = useDepartments();

  // Find primary AI agent or first automation
  const primaryAgent = automations.find(a => a.trigger_type === "ai_agent") || automations[0];

  // State
  const [prompt, setPrompt] = useState("");
  const [responseDelay, setResponseDelay] = useState(10);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [channelType, setChannelType] = useState<ChannelType>("all");
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [promptVersion, setPromptVersion] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Load existing agent data
  useEffect(() => {
    if (primaryAgent) {
      setPrompt(primaryAgent.ai_prompt || "");
      setIsActive(primaryAgent.is_active);
      setLastUpdated(new Date(primaryAgent.updated_at));
      
      // Parse trigger config
      const config = primaryAgent.trigger_config;
      if (config?.keywords && config.keywords.length > 0) {
        setKeywords(config.keywords.join(", "));
      }
      
      // Calculate version based on update history (simplified)
      setPromptVersion(1);
    }
  }, [primaryAgent]);

  // Track changes
  useEffect(() => {
    if (primaryAgent) {
      const currentPrompt = primaryAgent.ai_prompt || "";
      setHasChanges(prompt !== currentPrompt || isActive !== primaryAgent.is_active);
    }
  }, [prompt, isActive, primaryAgent]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const triggerConfig = {
        keywords: keywords.split(",").map(k => k.trim()).filter(k => k.length > 0),
        response_delay: responseDelay,
        channel_type: channelType,
        selected_instance: channelType === "instance" ? selectedInstance : null,
        selected_department: channelType === "department" ? selectedDepartment : null,
        knowledge_base_ids: selectedKnowledge,
      };

      if (primaryAgent) {
        await updateAutomation.mutateAsync({
          id: primaryAgent.id,
          ai_prompt: prompt,
          is_active: isActive,
          trigger_config: triggerConfig,
        });
      } else {
        await createAutomation.mutateAsync({
          name: "Agente IA Principal",
          description: "Agente de atendimento configurado pelo painel admin",
          webhook_url: "",
          trigger_type: "ai_agent",
          trigger_config: triggerConfig,
          ai_prompt: prompt,
          is_active: isActive,
        });
      }

      setHasChanges(false);
      setLastUpdated(new Date());
      setPromptVersion(prev => prev + 1);
      
      toast({
        title: "Configuração salva",
        description: "As configurações da IA foram atualizadas com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = automationsLoading || knowledgeLoading || instancesLoading || departmentsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Settings2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="font-semibold text-lg">IA do Site</h1>
                <p className="text-sm text-muted-foreground">
                  Configure o comportamento da IA de atendimento
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {hasChanges && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                <AlertCircle className="h-3 w-3 mr-1" />
                Não salvo
              </Badge>
            )}
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar Edição
            </Button>
          </div>
        </div>
        
        {/* Version & Last Updated */}
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Versão do prompt:</span>
            <Badge variant="secondary">Versão {promptVersion} - v{promptVersion}</Badge>
          </div>
          {lastUpdated && (
            <span className="text-muted-foreground">
              Última vez salvo em {format(lastUpdated, "dd MMM, HH:mm", { locale: ptBR })}
            </span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Area */}
        <div className="flex-1 p-6">
          <Card className="h-full">
            <CardContent className="p-0 h-full">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Digite aqui o prompt principal da IA...

Exemplo:
Você é um assistente virtual do escritório [Nome do Escritório]. Seu papel é:

1. Fazer a triagem inicial dos clientes
2. Coletar informações básicas sobre o caso
3. Agendar consultas quando solicitado
4. Responder dúvidas frequentes

Regras:
- Seja sempre cordial e profissional
- Nunca dê aconselhamento jurídico específico
- Encaminhe casos complexos para um advogado humano
- Mantenha a confidencialidade das informações"
                className="h-full resize-none border-0 focus-visible:ring-0 rounded-lg text-base font-mono"
                maxLength={MAX_PROMPT_LENGTH}
              />
            </CardContent>
          </Card>
          
          {/* Character Counter */}
          <div className="flex items-center justify-between mt-3">
            <span className={cn(
              "text-sm font-medium",
              prompt.length > MAX_PROMPT_LENGTH * 0.9 ? "text-destructive" : "text-primary"
            )}>
              {prompt.length}/{MAX_PROMPT_LENGTH}
            </span>
            <span className={cn(
              "text-sm",
              prompt.length > MAX_PROMPT_LENGTH * 0.9 ? "text-destructive" : "text-muted-foreground"
            )}>
              ({Math.round((prompt.length / MAX_PROMPT_LENGTH) * 100)}%)
            </span>
          </div>
        </div>

        {/* Settings Panel */}
        <div className="w-80 border-l border-border bg-card overflow-y-auto">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Configurações do Agente</h2>
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="p-4 space-y-6">
              {/* Knowledge Base */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Base de Conhecimento
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        {selectedKnowledge.length > 0 
                          ? `${selectedKnowledge.length} base(s) selecionada(s)`
                          : "Selecionar bases"
                        }
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="start">
                    <div className="space-y-2">
                      {knowledgeItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">
                          Nenhuma base de conhecimento cadastrada
                        </p>
                      ) : (
                        knowledgeItems.map((item) => (
                          <div key={item.id} className="flex items-center gap-2">
                            <Checkbox
                              id={item.id}
                              checked={selectedKnowledge.includes(item.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedKnowledge([...selectedKnowledge, item.id]);
                                } else {
                                  setSelectedKnowledge(selectedKnowledge.filter(id => id !== item.id));
                                }
                                setHasChanges(true);
                              }}
                            />
                            <label htmlFor={item.id} className="text-sm cursor-pointer flex-1">
                              {item.title}
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Response Delay */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Ativação e delay do agente
                </Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    value={responseDelay}
                    onChange={(e) => {
                      setResponseDelay(Number(e.target.value));
                      setHasChanges(true);
                    }}
                    min={1}
                    max={120}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">segundos</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tempo de espera antes de responder (simula atendimento humano)
                </p>
              </div>

              {/* Keywords */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Palavras-chave
                </Label>
                <Input
                  value={keywords}
                  onChange={(e) => {
                    setKeywords(e.target.value);
                    setHasChanges(true);
                  }}
                  placeholder="revisão, aposentadoria, contrato"
                />
                <p className="text-xs text-muted-foreground">
                  Separe por vírgula. Se vazio, responde a todos.
                </p>
              </div>

              {/* Channel Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Canal de Atendimento
                </Label>
                <Select 
                  value={channelType} 
                  onValueChange={(value: ChannelType) => {
                    setChannelType(value);
                    setHasChanges(true);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Geral (todos os contatos)</SelectItem>
                    <SelectItem value="instance">Número específico</SelectItem>
                    <SelectItem value="department">Por departamento</SelectItem>
                  </SelectContent>
                </Select>

                {channelType === "instance" && (
                  <Select 
                    value={selectedInstance} 
                    onValueChange={(value) => {
                      setSelectedInstance(value);
                      setHasChanges(true);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o número" />
                    </SelectTrigger>
                    <SelectContent>
                      {instances.map((instance) => (
                        <SelectItem key={instance.id} value={instance.id}>
                          {instance.instance_name} {instance.phone_number ? `(${instance.phone_number})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {channelType === "department" && (
                  <Select 
                    value={selectedDepartment} 
                    onValueChange={(value) => {
                      setSelectedDepartment(value);
                      setHasChanges(true);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Agent Status */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Power className="h-4 w-4" />
                  Status do Agente
                </Label>
                <Card className={cn(
                  "border-2 transition-colors",
                  isActive ? "border-green-500/30 bg-green-500/5" : "border-border"
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-3 w-3 rounded-full",
                          isActive ? "bg-green-500" : "bg-muted-foreground"
                        )} />
                        <div>
                          <p className="font-medium">
                            {isActive ? "Ativo" : "Inativo"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isActive ? "Respondendo mensagens" : "IA desligada"}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => {
                          setIsActive(checked);
                          setHasChanges(true);
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Primary Agent Indicator */}
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">
                    {primaryAgent ? "Agente primário configurado" : "Este será o agente primário"}
                  </span>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
