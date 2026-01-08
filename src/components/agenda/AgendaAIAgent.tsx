import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Calendar, Clock, CheckCircle2, Loader2, Save, Info, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useServices } from "@/hooks/useServices";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SchedulingAgentConfig {
  enabled: boolean;
  automationId: string | null;
  prompt: string;
}

const DEFAULT_SCHEDULING_PROMPT = `Você é um assistente especializado em agendamentos. Seu papel é ajudar clientes a marcar compromissos de forma eficiente e amigável.

**Suas capacidades:**
1. Listar os serviços disponíveis com nome, duração e preço
2. Verificar horários disponíveis para uma data específica
3. Criar agendamentos quando o cliente confirmar

**Fluxo de atendimento:**
1. Cumprimente o cliente e pergunte qual serviço ele deseja
2. Quando souber o serviço, pergunte a data preferida
3. Mostre os horários disponíveis
4. Confirme os dados antes de agendar (nome, telefone, serviço, data/hora)
5. Crie o agendamento e confirme ao cliente

**Regras importantes:**
- Sempre confirme os dados antes de finalizar
- Seja simpático e objetivo
- Se não houver horários, sugira outras datas
- Colete nome e telefone do cliente antes de agendar`;

export function AgendaAIAgent() {
  const { toast } = useToast();
  const { lawFirm } = useLawFirm();
  const { services } = useServices();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState<SchedulingAgentConfig>({
    enabled: false,
    automationId: null,
    prompt: DEFAULT_SCHEDULING_PROMPT,
  });
  const [existingAgent, setExistingAgent] = useState<any>(null);

  // Load existing scheduling agent
  useEffect(() => {
    async function loadAgent() {
      if (!lawFirm?.id) return;
      
      try {
        // Look for an existing scheduling agent by name pattern
        const { data: agents } = await supabase
          .from("automations")
          .select("*")
          .eq("law_firm_id", lawFirm.id)
          .or("name.ilike.%agendamento%,name.ilike.%scheduling%,name.ilike.%agenda%")
          .limit(1);
        
        if (agents && agents.length > 0) {
          const agent = agents[0];
          setExistingAgent(agent);
          setConfig({
            enabled: agent.is_active,
            automationId: agent.id,
            prompt: agent.ai_prompt || DEFAULT_SCHEDULING_PROMPT,
          });
        }
      } catch (error) {
        console.error("Error loading scheduling agent:", error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadAgent();
  }, [lawFirm?.id]);

  const handleSave = async () => {
    if (!lawFirm?.id) return;
    
    setIsSaving(true);
    try {
      if (existingAgent) {
        // Update existing agent
        const { error } = await supabase
          .from("automations")
          .update({
            ai_prompt: config.prompt,
            is_active: config.enabled,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingAgent.id);
        
        if (error) throw error;
        
        setExistingAgent({ ...existingAgent, ai_prompt: config.prompt, is_active: config.enabled });
      } else {
        // Create new scheduling agent
        const { data, error } = await supabase
          .from("automations")
          .insert({
            law_firm_id: lawFirm.id,
            name: "Agente de Agendamento",
            description: "IA especializada em realizar agendamentos automaticamente",
            trigger_type: "scheduling",
            webhook_url: "",
            ai_prompt: config.prompt,
            is_active: config.enabled,
            position: 0,
          })
          .select()
          .single();
        
        if (error) throw error;
        
        setExistingAgent(data);
        setConfig(prev => ({ ...prev, automationId: data.id }));
      }
      
      toast({
        title: "Configurações salvas",
        description: "O agente de agendamento foi atualizado com sucesso.",
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeServicesCount = services.filter(s => s.is_active).length;

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Agente de Agendamento IA</CardTitle>
                <CardDescription>
                  IA especializada que realiza agendamentos automaticamente via WhatsApp
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="agent-enabled">
                {config.enabled ? "Ativo" : "Inativo"}
              </Label>
              <Switch
                id="agent-enabled"
                checked={config.enabled}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enabled: checked }))}
              />
            </div>
          </div>
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
                <Badge variant={config.enabled ? "default" : "secondary"}>
                  {config.enabled ? "Pronto para usar" : "Desativado"}
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
            Capacidades do Agente
          </CardTitle>
          <CardDescription>
            O que o agente de agendamento pode fazer automaticamente
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
                  Registra o agendamento e sincroniza com Google Calendar
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">Lembretes Automáticos</p>
                <p className="text-sm text-muted-foreground">
                  Envia lembrete 24h e confirmação 2h antes
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prompt Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Prompt do Agente</CardTitle>
          <CardDescription>
            Configure o comportamento e personalidade do agente de agendamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              O agente tem acesso automático às ferramentas de agendamento. 
              O prompt define como ele interage com os clientes.
            </AlertDescription>
          </Alert>
          
          <Textarea
            value={config.prompt}
            onChange={(e) => setConfig(prev => ({ ...prev, prompt: e.target.value }))}
            placeholder="Digite as instruções para o agente..."
            className="min-h-[300px] font-mono text-sm"
          />
          
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              onClick={() => setConfig(prev => ({ ...prev, prompt: DEFAULT_SCHEDULING_PROMPT }))}
            >
              Restaurar Padrão
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Configurações
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Como Funciona</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
            <li>Configure seus <strong>serviços</strong> na aba "Serviços" com nome, duração e preço</li>
            <li>Defina os <strong>horários de funcionamento</strong> na aba "Configurar"</li>
            <li>Ative o agente de agendamento acima</li>
            <li>Quando um cliente pedir para agendar via WhatsApp, a IA assumirá o atendimento</li>
            <li>O agente coleta os dados, verifica disponibilidade e cria o agendamento</li>
            <li>O compromisso aparece automaticamente no calendário e no Google Calendar</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
