import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bot, Calendar, Clock, CheckCircle2, Loader2, Save, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useServices } from "@/hooks/useServices";
import { useAutomations } from "@/hooks/useAutomations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AgendaAIAgent() {
  const { toast } = useToast();
  const { lawFirm } = useLawFirm();
  const { services } = useServices();
  const { automations, isLoading: isLoadingAutomations } = useAutomations();
  
  const [isSaving, setIsSaving] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [schedulingEnabled, setSchedulingEnabled] = useState(false);

  // Find which agent has scheduling enabled
  useEffect(() => {
    if (automations && automations.length > 0) {
      const schedulingAgent = automations.find((a: any) => a.scheduling_enabled);
      if (schedulingAgent) {
        setSelectedAgentId(schedulingAgent.id);
        setSchedulingEnabled(true);
      }
    }
  }, [automations]);

  const handleSave = async () => {
    if (!lawFirm?.id) return;
    
    setIsSaving(true);
    try {
      // First, disable scheduling for all agents of this law firm
      await supabase
        .from("automations")
        .update({ scheduling_enabled: false })
        .eq("law_firm_id", lawFirm.id);

      // If enabled and agent selected, enable for that agent
      if (schedulingEnabled && selectedAgentId) {
        const { error } = await supabase
          .from("automations")
          .update({ scheduling_enabled: true })
          .eq("id", selectedAgentId);
        
        if (error) throw error;
      }
      
      toast({
        title: "Configurações salvas",
        description: schedulingEnabled && selectedAgentId 
          ? "O agente selecionado agora tem acesso às ferramentas de agendamento."
          : "Agendamento por IA desativado.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingAutomations) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeServicesCount = services.filter(s => s.is_active).length;
  const activeAgents = automations?.filter((a: any) => a.is_active) || [];
  const selectedAgent = automations?.find((a: any) => a.id === selectedAgentId);

  return (
    <div className="space-y-6">
      {/* Main Configuration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>Agente de Agendamento</CardTitle>
              <CardDescription>
                Selecione qual IA terá acesso às ferramentas de agendamento automático
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <Label className="text-base font-medium">Ativar Agendamento por IA</Label>
              <p className="text-sm text-muted-foreground">
                Quando ativo, o agente selecionado poderá agendar automaticamente
              </p>
            </div>
            <Switch
              checked={schedulingEnabled}
              onCheckedChange={setSchedulingEnabled}
            />
          </div>

          {/* Agent Selection */}
          {schedulingEnabled && (
            <div className="space-y-3">
              <Label>Selecionar Agente</Label>
              {activeAgents.length === 0 ? (
                <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                  <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum agente ativo encontrado.</p>
                  <p className="text-sm">Crie um agente em "Agentes de IA" primeiro.</p>
                </div>
              ) : (
                <Select
                  value={selectedAgentId || ""}
                  onValueChange={setSelectedAgentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um agente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAgents.map((agent: any) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4" />
                          {agent.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {selectedAgent && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm">
                    <strong>{selectedAgent.name}</strong> receberá automaticamente as ferramentas de agendamento e poderá:
                  </p>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                    <li>• Listar serviços disponíveis</li>
                    <li>• Verificar horários livres</li>
                    <li>• Criar, reagendar e cancelar agendamentos</li>
                    <li>• Confirmar presença de clientes</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Status Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resumo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Serviços Ativos</p>
                <p className="text-2xl font-bold">{activeServicesCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <Clock className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Horários Configurados</p>
                <p className="text-2xl font-bold">
                  {lawFirm?.business_hours ? "Sim" : "Não"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Status</p>
                <Badge variant={schedulingEnabled && selectedAgentId ? "default" : "secondary"}>
                  {schedulingEnabled && selectedAgentId ? "Ativo" : "Desativado"}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Ferramentas Disponíveis
          </CardTitle>
          <CardDescription>
            Quando ativo, o agente terá acesso automático a estas funcionalidades
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">Listar Serviços</p>
                <p className="text-sm text-muted-foreground">
                  Apresenta os serviços disponíveis com nome, duração e preço
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">Verificar Disponibilidade</p>
                <p className="text-sm text-muted-foreground">
                  Consulta os horários livres baseado no serviço e data
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">Criar Agendamentos</p>
                <p className="text-sm text-muted-foreground">
                  Registra o agendamento com todos os dados do cliente
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">Reagendar e Cancelar</p>
                <p className="text-sm text-muted-foreground">
                  Permite remarcar ou cancelar agendamentos existentes
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
