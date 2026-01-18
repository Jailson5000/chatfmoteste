import { useState, useEffect, useCallback, useRef, useContext } from "react";
import { useParams, useNavigate, UNSAFE_NavigationContext } from "react-router-dom";
import { useAutomations, Automation } from "@/hooks/useAutomations";
import { useUserRole } from "@/hooks/useUserRole";
import { useDepartments } from "@/hooks/useDepartments";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useTags } from "@/hooks/useTags";
import { useTemplates } from "@/hooks/useTemplates";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  ArrowLeft,
  ArrowRightLeft,
  Save,
  Loader2,
  Bot,
  Settings,
  Copy,
  Check,
  Wifi,
  WifiOff,
  FileText,
  Thermometer,
  Link2,
  Zap,
  History,
  AtSign,
  BookOpen,
  Volume2,
  Play,
  Square,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { AgentKnowledgeSection } from "@/components/ai-agents/AgentKnowledgeSection";
import { MentionEditor } from "@/components/ai-agents/MentionEditor";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// Available voices
import { AVAILABLE_VOICES, DEFAULT_VOICE_ID } from "@/lib/voiceConfig";

const TRIGGER_TYPES = [
  { value: "new_message", label: "Nova Mensagem Recebida" },
  { value: "keyword", label: "Palavra-chave Detectada" },
  { value: "schedule", label: "Agendamento" },
  { value: "status_change", label: "Mudança de Status" },
  { value: "new_client", label: "Novo Cliente" },
];

const MAX_PROMPT_CHARS = 10000;

export default function AIAgentEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { automations, isLoading, updateAutomation, refetch } = useAutomations();
  const { departments } = useDepartments();
  const { statuses } = useCustomStatuses();
  const { tags } = useTags();
  const { templates } = useTemplates();
  const { lawFirm } = useLawFirm();
  const { members: teamMembers } = useTeamMembers();
  const { toast } = useToast();

  const { navigator: routerNavigator } = useContext(UNSAFE_NavigationContext);
  const pendingNavigationRef = useRef<null | (() => void)>(null);

  const [automation, setAutomation] = useState<Automation | null>(null);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [editedTemperature, setEditedTemperature] = useState(0.7);
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedWebhookUrl, setEditedWebhookUrl] = useState("");
  const [editedTriggerType, setEditedTriggerType] = useState("new_message");
  const [isActive, setIsActive] = useState(true);
  const [notifyOnTransfer, setNotifyOnTransfer] = useState(false);
  // Response delay
  const [editedResponseDelay, setEditedResponseDelay] = useState(2);
  // Voice settings
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  const currentTriggerConfig = automation?.trigger_config as Record<string, unknown> | null;
  const currentResponseDelay = Number(currentTriggerConfig?.response_delay ?? currentTriggerConfig?.response_delay_seconds ?? 2);
  const hasChanges =
    !!automation &&
    (editedPrompt !== (automation.ai_prompt || "") ||
      editedTemperature !== (automation.ai_temperature || 0.7) ||
      editedName !== automation.name ||
      editedDescription !== (automation.description || "") ||
      editedWebhookUrl !== automation.webhook_url ||
      editedTriggerType !== automation.trigger_type ||
      isActive !== automation.is_active ||
      notifyOnTransfer !== (automation.notify_on_transfer || false) ||
      editedResponseDelay !== currentResponseDelay ||
      voiceEnabled !== Boolean(currentTriggerConfig?.voice_enabled) ||
      voiceId !== ((currentTriggerConfig?.voice_id as string) || DEFAULT_VOICE_ID));

  useEffect(() => {
    if (automations && id) {
      const found = automations.find((a) => a.id === id);
      if (found) {
        setAutomation(found);
        setEditedPrompt(found.ai_prompt || "");
        setEditedTemperature(found.ai_temperature || 0.7);
        setEditedName(found.name);
        setEditedDescription(found.description || "");
        setEditedWebhookUrl(found.webhook_url);
        setEditedTriggerType(found.trigger_type);
        setIsActive(found.is_active);
        setNotifyOnTransfer(found.notify_on_transfer || false);
        setLastSaved(new Date(found.updated_at));

        // Load voice and delay settings from trigger_config
        const triggerConfig = found.trigger_config as Record<string, unknown> | null;
        if (triggerConfig) {
          setVoiceEnabled(Boolean(triggerConfig.voice_enabled));
          setVoiceId((triggerConfig.voice_id as string) || DEFAULT_VOICE_ID);
          setEditedResponseDelay(Number(triggerConfig.response_delay ?? triggerConfig.response_delay_seconds ?? 2));
        }
      }
    }
  }, [automations, id]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Warn before browser/tab close if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasChanges) return;
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  // Block SPA navigations when there are unsaved changes (BrowserRouter-compatible)
  useEffect(() => {
    if (!hasChanges) return;

    const nav = routerNavigator as any;
    if (typeof nav?.block !== "function") return;

    const unblock = nav.block((tx: any) => {
      pendingNavigationRef.current = () => {
        unblock();
        tx.retry();
      };
      setShowUnsavedDialog(true);
    });

    return unblock;
  }, [hasChanges, routerNavigator]);


  const handleRestoreLastVersion = useCallback(() => {
    if (automation?.last_prompt) {
      setEditedPrompt(automation.last_prompt);
      toast({
        title: "Versão restaurada",
        description: "A última versão do prompt foi restaurada. Clique em Salvar para confirmar.",
      });
    }
  }, [automation, toast]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acesso Restrito</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (roleLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Agente não encontrado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">O agente solicitado não foi encontrado.</p>
            <Button onClick={() => navigate('/ai-agents')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const promptLength = editedPrompt.length;
  const promptPercentage = Math.round((promptLength / MAX_PROMPT_CHARS) * 100);
  const isOverLimit = promptLength > MAX_PROMPT_CHARS;

  // hasChanges/currentTriggerConfig são calculados acima (usados por navegação + UI)

  const handleSave = async () => {
    if (isOverLimit) {
      toast({
        title: "Prompt muito longo",
        description: `O prompt excede o limite de ${MAX_PROMPT_CHARS} caracteres.`,
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Build updated trigger_config with voice and delay settings
      const existingConfig = automation.trigger_config as Record<string, unknown> | null;
      const updatedTriggerConfig = {
        ...existingConfig,
        voice_enabled: voiceEnabled,
        voice_id: voiceId,
        response_delay: editedResponseDelay,
      };

      // Update automation in database
      await updateAutomation.mutateAsync({
        id: automation.id,
        name: editedName,
        description: editedDescription,
        webhook_url: editedWebhookUrl,
        trigger_type: editedTriggerType,
        ai_prompt: editedPrompt,
        ai_temperature: editedTemperature,
        is_active: isActive,
        trigger_config: updatedTriggerConfig,
        notify_on_transfer: notifyOnTransfer,
      } as any);

      // Sync prompt with N8N
      const { error } = await supabase.functions.invoke('sync-n8n-prompt', {
        body: {
          automation_id: automation.id,
          ai_prompt: editedPrompt,
          ai_temperature: editedTemperature,
          webhook_url: editedWebhookUrl,
        },
      });

      if (error) {
        console.error('Error syncing with N8N:', error);
        toast({
          title: "Salvo com aviso",
          description: "Salvo localmente, mas não foi possível sincronizar com N8N.",
        });
      } else {
        toast({
          title: "Salvo e sincronizado",
          description: "As configurações foram salvas e sincronizadas com N8N.",
        });
      }

      setLastSaved(new Date());
      
      // Refresh to get updated last_prompt
      await refetch();
      
      setAutomation({
        ...automation,
        name: editedName,
        description: editedDescription,
        webhook_url: editedWebhookUrl,
        trigger_type: editedTriggerType,
        ai_prompt: editedPrompt,
        ai_temperature: editedTemperature,
        is_active: isActive,
        notify_on_transfer: notifyOnTransfer,
        updated_at: new Date().toISOString(),
        last_prompt: automation.ai_prompt, // Previous prompt is now last_prompt
        version: (automation.version || 1) + 1, // Increment version
      });
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyWebhook = () => {
    window.navigator.clipboard.writeText(editedWebhookUrl);
    setCopiedUrl(true);
    toast({
      title: "URL copiada",
      description: "A URL do webhook foi copiada.",
    });
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleTestVoice = async () => {
    if (isPlayingVoice && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlayingVoice(false);
      return;
    }

    setIsTestingVoice(true);
    try {
      const testText = "Olá! Esta é uma demonstração da voz selecionada.";
      
      // Get ElevenLabs voice ID
      const voice = AVAILABLE_VOICES.find(v => v.id === voiceId);
      const voiceIdToSend = voice?.externalId || voiceId;
      
      // Get user session for authenticated request
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Usuário não autenticado");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ 
            text: testText,
            voiceId: voiceIdToSend,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Falha ao gerar áudio");
      }

      const data = await response.json();
      
      if (data.audioContent) {
        const audioUrl = `data:audio/mpeg;base64,${data.audioContent}`;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        
        audio.onended = () => {
          setIsPlayingVoice(false);
          audioRef.current = null;
        };
        
        audio.onerror = () => {
          setIsPlayingVoice(false);
          audioRef.current = null;
          toast({
            title: "Erro ao reproduzir",
            description: "Não foi possível reproduzir o áudio",
            variant: "destructive",
          });
        };
        
        await audio.play();
        setIsPlayingVoice(true);
      }
    } catch (error: any) {
      console.error("[AIAgentEdit] Voice test error:", error);
      toast({
        title: "Erro no teste",
        description: error.message || "Não foi possível testar a voz",
        variant: "destructive",
      });
    } finally {
      setIsTestingVoice(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus('idle');
    
    try {
      const response = await fetch(editedWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'connection_test',
          timestamp: new Date().toISOString(),
          message: 'Teste de conexão do MiauChat',
        }),
      });

      if (response.ok) {
        setConnectionStatus('success');
        toast({
          title: "Conexão bem-sucedida!",
          description: "O webhook está respondendo.",
        });
      } else {
        setConnectionStatus('error');
        toast({
          title: "Erro na conexão",
          description: `Status ${response.status}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      setConnectionStatus('error');
      toast({
        title: "Falha na conexão",
        description: "Não foi possível conectar.",
        variant: "destructive",
      });
    } finally {
      setIsTestingConnection(false);
      setTimeout(() => setConnectionStatus('idle'), 3000);
    }
  };

  // Handle back navigation (blocked when there are unsaved changes)
  const handleBack = () => {
    navigate("/ai-agents");
  };

  const cancelLeave = () => {
    pendingNavigationRef.current = null;
    setShowUnsavedDialog(false);
  };

  const confirmLeave = () => {
    setShowUnsavedDialog(false);

    const proceed = pendingNavigationRef.current;
    pendingNavigationRef.current = null;

    if (proceed) {
      proceed();
    } else {
      // Fallback (e.g., when opened via the header button)
      navigate("/ai-agents");
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-background">
      {/* Unsaved changes dialog */}
      <AlertDialog
        open={showUnsavedDialog}
        onOpenChange={(open) => {
          setShowUnsavedDialog(open);
          if (!open) pendingNavigationRef.current = null;
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle>Tem certeza que deseja sair?</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Você tem alterações não salvas no formulário. Se você sair, essas alterações serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelLeave}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLeave}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleBack}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">{editedName}</h1>
              <p className="text-sm text-muted-foreground">
                {editedDescription || 'Agente de IA'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Versão do prompt:</span>
            <Badge variant="secondary">Versão {automation.version || 1} - v{automation.version || 1}</Badge>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {lastSaved && (
            <span className="text-xs text-muted-foreground">
              Última vez salvo em {lastSaved.toLocaleDateString('pt-BR')} {lastSaved.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          
          <Button 
            onClick={handleSave}
            disabled={!hasChanges || isSaving || isOverLimit}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Edição
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Prompt Editor Area */}
        <div className="flex-1 flex flex-col p-6 min-w-0 min-h-0 overflow-hidden">
          <div className="flex-1 min-w-0 min-h-0">
            <MentionEditor
              value={editedPrompt}
              onChange={setEditedPrompt}
              placeholder="Digite o prompt que define o comportamento da IA...

Use @ para inserir variáveis dinâmicas como @Nome do cliente, @departamento:Vendas, etc.

Exemplo:
REGRAS DE COMUNICAÇÃO
• Linguagem clara, educada, profissional e acolhedora
• Forneça orientações gerais e faça a triagem inicial

Você é uma atendente da empresa @Nome da empresa, especializada em atender e direcionar os clientes."
              maxLength={MAX_PROMPT_CHARS}
              className={cn(isOverLimit && "text-destructive")}
              departments={departments || []}
              statuses={statuses || []}
              tags={tags || []}
              templates={templates || []}
              teamMembers={teamMembers}
              aiAgents={automations.filter(a => a.is_active)}
              lawFirm={lawFirm || undefined}
            />
          </div>
        </div>

        {/* Settings Sidebar */}
        <div className="w-80 flex-shrink-0 border-l bg-card overflow-auto">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="h-5 w-5" />
              <h2 className="font-semibold">Configurações do Agente</h2>
            </div>

            {/* Character Count */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Prompt</span>
                <span className={cn(
                  "font-mono",
                  isOverLimit ? "text-destructive" : "text-muted-foreground"
                )}>
                  {promptLength}/{MAX_PROMPT_CHARS}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all",
                    isOverLimit ? "bg-destructive" : promptPercentage > 90 ? "bg-yellow-500" : "bg-primary"
                  )}
                  style={{ width: `${Math.min(promptPercentage, 100)}%` }}
                />
              </div>
              {isOverLimit && (
                <p className="text-xs text-destructive mt-1">
                  ({promptPercentage}%) - Excede o limite
                </p>
              )}
            </div>

            {/* Restore Last Version */}
            {automation.last_prompt && (
              <div className="mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRestoreLastVersion}
                  className="w-full gap-2"
                >
                  <History className="h-4 w-4" />
                  Restaurar última versão
                </Button>
              </div>
            )}

            {/* Tip for mentions */}
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <AtSign className="h-4 w-4" />
                Digite @ no editor para inserir variáveis dinâmicas. Clique em uma menção para editá-la.
              </p>
            </div>

            <Separator className="my-4" />

            {/* Agent Name */}
            <div className="space-y-2 mb-4">
              <Label className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4" />
                Nome do Agente
              </Label>
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                placeholder="Nome do agente"
              />
            </div>

            {/* Description */}
            <div className="space-y-2 mb-4">
              <Label className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Descrição
              </Label>
              <Textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                placeholder="Descreva o que este agente faz..."
                className="resize-none"
                rows={2}
              />
            </div>

            <Separator className="my-4" />

            {/* Active Toggle */}
            <div className="flex items-center justify-between mb-4">
              <Label className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Ativo
              </Label>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>

            {/* Response Delay */}
            <div className="space-y-2 mb-4">
              <Label className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Delay de Resposta
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={editedResponseDelay}
                  onChange={(e) => setEditedResponseDelay(Number(e.target.value))}
                  min={0}
                  max={120}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">segundos</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Tempo adicional antes de responder (+ 7-15s de jitter humano)
              </p>
            </div>

            {/* Notify on Transfer Toggle */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4" />
                  Avisar ao transferir
                </Label>
                <Switch
                  checked={notifyOnTransfer}
                  onCheckedChange={setNotifyOnTransfer}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Se ativado, a IA envia uma mensagem ao cliente quando transferir para outro departamento ou humano.
              </p>
            </div>

            {/* Trigger Type */}
            <div className="space-y-2 mb-4">
              <Label className="text-sm">Gatilho</Label>
              <Select
                value={editedTriggerType}
                onValueChange={setEditedTriggerType}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator className="my-4" />

            {/* Temperature */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm flex items-center gap-2">
                  <Thermometer className="h-4 w-4" />
                  Temperatura
                </Label>
                <Badge variant="secondary" className="font-mono">
                  {editedTemperature.toFixed(1)}
                </Badge>
              </div>
              <Slider
                value={[editedTemperature]}
                onValueChange={(value) => setEditedTemperature(value[0])}
                min={0}
                max={1}
                step={0.1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Baixo = Focado | Alto = Criativo
              </p>
            </div>

            <Separator className="my-4" />

            {/* Knowledge Base Section */}
            <AgentKnowledgeSection automationId={automation.id} />

            <Separator className="my-4" />

            {/* Voice Settings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  Voz do Agente
                </Label>
                <Switch
                  checked={voiceEnabled}
                  onCheckedChange={setVoiceEnabled}
                />
              </div>
              
              {voiceEnabled && (
                <div className="space-y-3">
                  <Select value={voiceId} onValueChange={setVoiceId}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {AVAILABLE_VOICES.find(v => v.id === voiceId)?.name || "Selecione uma voz"} ({AVAILABLE_VOICES.find(v => v.id === voiceId)?.gender === "female" ? "Feminina" : "Masculina"})
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_VOICES.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          <span className="flex items-center gap-2">
                            {voice.name}
                            <Badge variant="secondary" className="text-xs">
                              {voice.gender === "female" ? "Feminina" : "Masculina"}
                            </Badge>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestVoice}
                    disabled={isTestingVoice}
                    className="w-full gap-2"
                  >
                    {isTestingVoice ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isPlayingVoice ? (
                      <Square className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {isPlayingVoice ? "Parar" : "Testar Voz"}
                  </Button>
                  
                  <p className="text-xs text-muted-foreground">
                    O agente responderá com áudio além de texto
                  </p>
                </div>
              )}
            </div>

            <Separator className="my-4" />

            {/* Webhook URL */}
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Webhook URL (N8N)
              </Label>
              <div className="flex gap-2">
                <Input
                  value={editedWebhookUrl}
                  onChange={(e) => setEditedWebhookUrl(e.target.value)}
                  placeholder="https://n8n.exemplo.com/webhook/..."
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyWebhook}
                  className="flex-1 gap-2"
                >
                  {copiedUrl ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  Copiar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={isTestingConnection || !editedWebhookUrl}
                  className={cn(
                    "flex-1 gap-2",
                    connectionStatus === 'success' && "border-green-500 text-green-500",
                    connectionStatus === 'error' && "border-destructive text-destructive"
                  )}
                >
                  {isTestingConnection ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : connectionStatus === 'success' ? (
                    <Wifi className="h-3 w-3" />
                  ) : connectionStatus === 'error' ? (
                    <WifiOff className="h-3 w-3" />
                  ) : (
                    <Wifi className="h-3 w-3" />
                  )}
                  Testar
                </Button>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Quick Info */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                <strong>ID:</strong> {automation.id.slice(0, 8)}...
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>Criado:</strong> {new Date(automation.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
