import { useState } from "react";
import { MessageSquare, Copy, Check, ExternalLink, Loader2, Bot, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTrayIntegration } from "@/hooks/useTrayIntegration";
import { useAutomations } from "@/hooks/useAutomations";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function TrayIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-[#25D366] flex items-center justify-center">
      <MessageSquare className="h-5 w-5 text-white" />
    </div>
  );
}

export function TrayChatIntegration() {
  const { integration, isLoading, toggleIntegration, isToggling, updateSettings, isUpdatingSettings } = useTrayIntegration();
  const { automations } = useAutomations();
  const { members: teamMembers } = useTeamMembers();
  const [showSnippetDialog, setShowSnippetDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  const isEnabled = integration?.is_enabled ?? false;

  const handleToggle = async (enabled: boolean) => {
    await toggleIntegration(enabled);
    if (enabled) {
      setShowSnippetDialog(true);
    }
  };

  const handleCopySnippet = async () => {
    if (!integration?.snippet_code) return;
    
    try {
      await navigator.clipboard.writeText(integration.snippet_code);
      setCopied(true);
      toast.success("Código copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Erro ao copiar código");
    }
  };

  const handleHandlerTypeChange = (value: string) => {
    if (value === 'ai') {
      updateSettings({ 
        default_handler_type: 'ai',
        default_human_agent_id: null 
      });
    } else {
      updateSettings({ 
        default_handler_type: 'human',
        default_automation_id: null 
      });
    }
  };

  const handleAutomationChange = (automationId: string) => {
    updateSettings({ 
      default_automation_id: automationId === 'none' ? null : automationId 
    });
  };

  const handleHumanAgentChange = (agentId: string) => {
    updateSettings({ 
      default_human_agent_id: agentId === 'none' ? null : agentId 
    });
  };

  if (isLoading) {
    return (
      <Card className="relative overflow-hidden">
        <CardContent className="p-4 flex items-center gap-4">
          <TrayIcon />
          <div className="flex-1">
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            <div className="h-3 w-48 bg-muted animate-pulse rounded mt-2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentHandlerType = integration?.default_handler_type || 'human';
  const activeAutomations = automations?.filter(a => a.is_active) || [];
  const activeMembers = teamMembers?.filter(m => m.is_active) || [];

  return (
    <>
      <Card className="relative overflow-hidden h-full flex flex-col">
        <CardContent className="p-4 flex flex-col flex-1">
          <div className="flex items-start gap-4 flex-1">
            <TrayIcon />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-sm">Chat Web</h3>
                {isEnabled && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20">
                    Ativo
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                Adicione o chat ao seu site para atender visitantes em tempo real.
              </p>
            </div>
          </div>
          
          {isEnabled && (
            <div className="mt-4 space-y-3 border-t pt-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium text-muted-foreground min-w-[100px]">
                  Atendimento:
                </Label>
                <Select
                  value={currentHandlerType}
                  onValueChange={handleHandlerTypeChange}
                  disabled={isUpdatingSettings}
                >
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="human">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3" />
                        <span>Humano</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="ai">
                      <div className="flex items-center gap-2">
                        <Bot className="h-3 w-3" />
                        <span>Agente IA</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {currentHandlerType === 'ai' && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-medium text-muted-foreground min-w-[100px]">
                    Agente IA:
                  </Label>
                  <Select
                    value={integration?.default_automation_id || 'none'}
                    onValueChange={handleAutomationChange}
                    disabled={isUpdatingSettings}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Selecione um agente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum (aguardar humano)</SelectItem>
                      {activeAutomations.map(automation => (
                        <SelectItem key={automation.id} value={automation.id}>
                          {automation.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {currentHandlerType === 'human' && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-medium text-muted-foreground min-w-[100px]">
                    Responsável:
                  </Label>
                  <Select
                    value={integration?.default_human_agent_id || 'none'}
                    onValueChange={handleHumanAgentChange}
                    disabled={isUpdatingSettings}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Selecione um responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Fila (sem responsável)</SelectItem>
                      {activeMembers.map(member => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          
          <div className="flex items-center justify-between mt-auto pt-3 border-t">
            <div className="flex items-center space-x-2">
              <Switch
                id="tray-toggle"
                checked={isEnabled}
                onCheckedChange={handleToggle}
                disabled={isToggling}
              />
              <Label htmlFor="tray-toggle" className="text-xs">
                {isToggling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  isEnabled ? "Ativado" : "Desativado"
                )}
              </Label>
            </div>
            
            {isEnabled && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setShowSnippetDialog(true)}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Ver código
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showSnippetDialog} onOpenChange={setShowSnippetDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrayIcon />
              Código do Chat Web
            </DialogTitle>
            <DialogDescription>
              Cole este código no HEAD ou FOOTER do seu site.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Textarea
                readOnly
                value={integration?.snippet_code || ""}
                className="font-mono text-xs min-h-[150px] bg-muted"
              />
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2"
                onClick={handleCopySnippet}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copiar
                  </>
                )}
              </Button>
            </div>

            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                ⚠️ <strong>Importante:</strong> Este código é único para sua empresa. Não compartilhe com terceiros.
              </p>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Status:</strong> {isEnabled ? "Integração ativa" : "Integração desativada"}</p>
              <p><strong>Modo:</strong> {currentHandlerType === 'ai' ? 'Atendimento por IA' : 'Atendimento Humano'}</p>
              {integration?.created_at && (
                <p><strong>Criado em:</strong> {new Date(integration.created_at).toLocaleDateString('pt-BR')}</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}