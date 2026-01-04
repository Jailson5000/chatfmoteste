import { useState } from "react";
import {
  Bot,
  Calendar,
  Copy,
  FileText,
  Headphones,
  Loader2,
  MessageSquare,
  ShoppingCart,
  Star,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentTemplates, AgentTemplate } from "@/hooks/useAgentTemplates";
import { useAutomations } from "@/hooks/useAutomations";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Map icon strings to components
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  bot: Bot,
  calendar: Calendar,
  headphones: Headphones,
  "shopping-cart": ShoppingCart,
  "message-square": MessageSquare,
  "file-text": FileText,
};

interface AgentTemplatesListProps {
  onCloneSuccess?: () => void;
}

export function AgentTemplatesList({ onCloneSuccess }: AgentTemplatesListProps) {
  const { toast } = useToast();
  const { templates, isLoading, incrementUsageCount } = useAgentTemplates();
  const { createAutomation } = useAutomations();
  const { lawFirm } = useLawFirm();
  
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneDescription, setCloneDescription] = useState("");
  const [isCloning, setIsCloning] = useState(false);

  const handleSelectTemplate = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    setCloneName(template.name);
    setCloneDescription(template.description || "");
  };

  const handleCloneTemplate = async () => {
    if (!selectedTemplate || !lawFirm?.id || !cloneName.trim()) return;

    setIsCloning(true);
    try {
      // Parse trigger_config from template
      const templateTriggerConfig = typeof selectedTemplate.trigger_config === 'object' && selectedTemplate.trigger_config !== null
        ? selectedTemplate.trigger_config as Record<string, unknown>
        : {};

      // Create new automation based on template
      await createAutomation.mutateAsync({
        name: cloneName,
        description: cloneDescription || selectedTemplate.description || "",
        webhook_url: "", // Empty, will use internal AI
        ai_prompt: selectedTemplate.ai_prompt,
        trigger_type: selectedTemplate.trigger_type,
        trigger_config: {
          ...templateTriggerConfig,
          voice_enabled: selectedTemplate.voice_enabled,
          voice_id: selectedTemplate.voice_id,
        },
        is_active: false, // Start inactive so user can review
      });

      // Increment usage count
      await incrementUsageCount.mutateAsync(selectedTemplate.id);

      toast({
        title: "Agente criado com sucesso!",
        description: `O agente "${cloneName}" foi criado a partir do template. Revise as configurações e ative-o quando estiver pronto.`,
      });

      setSelectedTemplate(null);
      setCloneName("");
      setCloneDescription("");
      onCloneSuccess?.();
    } catch (error: any) {
      toast({
        title: "Erro ao criar agente",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCloning(false);
    }
  };

  const getIcon = (iconName: string) => {
    const Icon = iconMap[iconName] || Bot;
    return Icon;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-medium text-lg mb-1">Nenhum template disponível</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Em breve novos templates de agentes estarão disponíveis para você usar.
        </p>
      </div>
    );
  }

  // Group templates by category
  const groupedTemplates = templates.reduce((acc, template) => {
    const category = template.category || "geral";
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {} as Record<string, AgentTemplate[]>);

  const categoryLabels: Record<string, string> = {
    geral: "Geral",
    agendamento: "Agendamento",
    atendimento: "Atendimento",
    vendas: "Vendas",
    suporte: "Suporte",
  };

  return (
    <>
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-8">
          {/* Featured Templates */}
          {templates.filter(t => t.is_featured).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500" />
                <h2 className="font-semibold text-lg">Templates em Destaque</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.filter(t => t.is_featured).map((template) => {
                  const Icon = getIcon(template.icon);
                  return (
                    <Card 
                      key={template.id}
                      className="cursor-pointer hover:border-primary/50 transition-colors group"
                      onClick={() => handleSelectTemplate(template)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <CardTitle className="text-base">{template.name}</CardTitle>
                              <Badge variant="secondary" className="mt-1">
                                {categoryLabels[template.category] || template.category}
                              </Badge>
                            </div>
                          </div>
                          <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <CardDescription className="line-clamp-2">
                          {template.description || "Sem descrição disponível"}
                        </CardDescription>
                        <div className="mt-4 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {template.usage_count || 0} uso{template.usage_count !== 1 ? "s" : ""}
                          </span>
                          <Button size="sm" variant="ghost" className="gap-2">
                            <Copy className="h-4 w-4" />
                            Usar template
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* All Templates by Category */}
          {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
            <div key={category} className="space-y-4">
              <h2 className="font-semibold text-lg">
                {categoryLabels[category] || category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryTemplates.map((template) => {
                  const Icon = getIcon(template.icon);
                  return (
                    <Card 
                      key={template.id}
                      className={cn(
                        "cursor-pointer hover:border-primary/50 transition-colors group",
                        template.is_featured && "border-amber-500/30"
                      )}
                      onClick={() => handleSelectTemplate(template)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-base">{template.name}</CardTitle>
                            {template.voice_enabled && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                Com voz
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <CardDescription className="line-clamp-2">
                          {template.description || "Sem descrição disponível"}
                        </CardDescription>
                        <div className="mt-4 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {template.usage_count || 0} uso{template.usage_count !== 1 ? "s" : ""}
                          </span>
                          <Button size="sm" variant="ghost" className="gap-2">
                            <Copy className="h-4 w-4" />
                            Usar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Clone Template Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              Usar Template: {selectedTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              Um novo agente será criado baseado neste template. Você pode personalizar o nome e descrição.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="clone-name">Nome do Agente</Label>
              <Input
                id="clone-name"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="Ex: Assistente de Agendamento"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="clone-description">Descrição</Label>
              <Textarea
                id="clone-description"
                value={cloneDescription}
                onChange={(e) => setCloneDescription(e.target.value)}
                placeholder="Descreva a função do agente..."
                rows={2}
              />
            </div>

            {selectedTemplate && (
              <div className="space-y-2">
                <Label>Prompt do Template</Label>
                <div className="bg-muted rounded-lg p-4 max-h-48 overflow-auto">
                  <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground">
                    {selectedTemplate.ai_prompt}
                  </pre>
                </div>
                <p className="text-xs text-muted-foreground">
                  Você poderá editar o prompt após criar o agente.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCloneTemplate}
              disabled={!cloneName.trim() || isCloning}
            >
              {isCloning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Agente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
