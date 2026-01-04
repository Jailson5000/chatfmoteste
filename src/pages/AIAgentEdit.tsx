import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAutomations, Automation } from "@/hooks/useAutomations";
import { useUserRole } from "@/hooks/useUserRole";
import { useDepartments } from "@/hooks/useDepartments";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useTags } from "@/hooks/useTags";
import { useTemplates } from "@/hooks/useTemplates";
import { useLawFirm } from "@/hooks/useLawFirm";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowLeft, 
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
  Building2,
  Tag,
  Users,
  Clock,
  MessageSquare,
} from "lucide-react";
import { AgentKnowledgeSection } from "@/components/ai-agents/AgentKnowledgeSection";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// Available voices
// Vozes importadas do arquivo centralizado
import { AVAILABLE_VOICES, DEFAULT_VOICE_ID } from "@/lib/voiceConfig";

const TRIGGER_TYPES = [
  { value: 'new_message', label: 'Nova Mensagem Recebida' },
  { value: 'keyword', label: 'Palavra-chave Detectada' },
  { value: 'schedule', label: 'Agendamento' },
  { value: 'status_change', label: 'Mudança de Status' },
  { value: 'new_client', label: 'Novo Cliente' },
];

const MAX_PROMPT_CHARS = 10000;

// Static mention variables
const STATIC_MENTION_VARIABLES = [
  { key: '@Nome da empresa', description: 'Nome da sua empresa', category: 'info', icon: Building2 },
  { key: '@Endereço', description: 'Endereço da empresa', category: 'info', icon: Building2 },
  { key: '@Telefone', description: 'Telefone de contato', category: 'info', icon: Building2 },
  { key: '@Email', description: 'Email de contato', category: 'info', icon: Building2 },
  { key: '@Instagram', description: 'Instagram da empresa', category: 'info', icon: Building2 },
  { key: '@Facebook', description: 'Facebook da empresa', category: 'info', icon: Building2 },
  { key: '@Website', description: 'Website da empresa', category: 'info', icon: Building2 },
  { key: '@Horário comercial', description: 'Horário de funcionamento', category: 'hours', icon: Clock },
  { key: '@Nome do cliente', description: 'Nome do cliente na conversa', category: 'client', icon: Users },
  { key: '@Responsável', description: 'Nome do responsável pelo atendimento', category: 'client', icon: Users },
  { key: '@Data atual', description: 'Data atual formatada', category: 'system', icon: Clock },
  { key: '@Hora atual', description: 'Hora atual formatada', category: 'system', icon: Clock },
  { key: '@Ativar áudio', description: 'Comando para ativar resposta por áudio', category: 'system', icon: Volume2 },
  { key: '@Desativar áudio', description: 'Comando para desativar resposta por áudio', category: 'system', icon: Volume2 },
];

type MentionVariable = {
  key: string;
  description: string;
  category: string;
  icon: React.ElementType;
};

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
  const { toast } = useToast();

  const [automation, setAutomation] = useState<Automation | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedTemperature, setEditedTemperature] = useState(0.7);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedWebhookUrl, setEditedWebhookUrl] = useState('');
  const [editedTriggerType, setEditedTriggerType] = useState('new_message');
  const [isActive, setIsActive] = useState(true);
  
  // Voice settings
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mentionPopupRef = useRef<HTMLDivElement | null>(null);

  // Build dynamic mentions list from database data
  const allMentions = useMemo((): MentionVariable[] => {
    const mentions: MentionVariable[] = [...STATIC_MENTION_VARIABLES];
    
    // Add departments
    if (departments && departments.length > 0) {
      departments.forEach(dept => {
        mentions.push({
          key: `@departamento:${dept.name}`,
          description: `Departamento: ${dept.name}`,
          category: 'department',
          icon: Building2,
        });
      });
    }
    
    // Add statuses
    if (statuses && statuses.length > 0) {
      statuses.forEach(status => {
        mentions.push({
          key: `@status:${status.name}`,
          description: `Status: ${status.name}`,
          category: 'status',
          icon: Tag,
        });
      });
    }
    
    // Add tags
    if (tags && tags.length > 0) {
      tags.forEach(tag => {
        mentions.push({
          key: `@etiqueta:${tag.name}`,
          description: `Etiqueta: ${tag.name}`,
          category: 'tag',
          icon: Tag,
        });
      });
    }
    
    // Add templates
    if (templates && templates.length > 0) {
      templates.forEach(tpl => {
        mentions.push({
          key: `@template:${tpl.name}`,
          description: `Template: ${tpl.name}`,
          category: 'template',
          icon: MessageSquare,
        });
      });
    }
    
    return mentions;
  }, [departments, statuses, tags, templates]);

  // Filter mentions based on search
  const filteredMentions = useMemo(() => {
    if (!mentionFilter) return allMentions;
    const filter = mentionFilter.toLowerCase();
    return allMentions.filter(m => 
      m.key.toLowerCase().includes(filter) || 
      m.description.toLowerCase().includes(filter)
    );
  }, [allMentions, mentionFilter]);

  useEffect(() => {
    if (automations && id) {
      const found = automations.find(a => a.id === id);
      if (found) {
        setAutomation(found);
        setEditedPrompt(found.ai_prompt || '');
        setEditedTemperature(found.ai_temperature || 0.7);
        setEditedName(found.name);
        setEditedDescription(found.description || '');
        setEditedWebhookUrl(found.webhook_url);
        setEditedTriggerType(found.trigger_type);
        setIsActive(found.is_active);
        setLastSaved(new Date(found.updated_at));
        
        // Load voice settings from trigger_config
        const triggerConfig = found.trigger_config as Record<string, unknown> | null;
        if (triggerConfig) {
          setVoiceEnabled(Boolean(triggerConfig.voice_enabled));
          setVoiceId((triggerConfig.voice_id as string) || DEFAULT_VOICE_ID);
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

  const insertMention = useCallback((mention: string) => {
    // Find the @ position before cursor and replace from there
    const textBeforeCursor = editedPrompt.slice(0, cursorPosition);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
      const before = editedPrompt.slice(0, atIndex);
      const after = editedPrompt.slice(cursorPosition);
      const newPrompt = before + mention + ' ' + after;
      setEditedPrompt(newPrompt);
      
      // Move cursor after the inserted mention
      const newCursorPos = atIndex + mention.length + 1;
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newCursorPos;
          textareaRef.current.selectionEnd = newCursorPos;
          textareaRef.current.focus();
        }
      }, 0);
    } else {
      // Fallback: insert at cursor
      const before = editedPrompt.slice(0, cursorPosition);
      const after = editedPrompt.slice(cursorPosition);
      const newPrompt = before + mention + ' ' + after;
      setEditedPrompt(newPrompt);
    }
    
    setShowMentions(false);
    setMentionFilter('');
  }, [editedPrompt, cursorPosition]);

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const pos = e.target.selectionStart || 0;
    setEditedPrompt(value);
    setCursorPosition(pos);
    
    // Check if we're typing after @
    const textBeforeCursor = value.slice(0, pos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // Only show mentions if there's no space after @ (still typing the mention)
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setShowMentions(true);
        setMentionFilter(textAfterAt);
      } else {
        setShowMentions(false);
        setMentionFilter('');
      }
    } else {
      setShowMentions(false);
      setMentionFilter('');
    }
  }, []);

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

  const currentTriggerConfig = automation.trigger_config as Record<string, unknown> | null;
  const hasChanges = 
    editedPrompt !== (automation.ai_prompt || '') ||
    editedTemperature !== (automation.ai_temperature || 0.7) ||
    editedName !== automation.name ||
    editedDescription !== (automation.description || '') ||
    editedWebhookUrl !== automation.webhook_url ||
    editedTriggerType !== automation.trigger_type ||
    isActive !== automation.is_active ||
    voiceEnabled !== Boolean(currentTriggerConfig?.voice_enabled) ||
    voiceId !== ((currentTriggerConfig?.voice_id as string) || DEFAULT_VOICE_ID);

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
      // Build updated trigger_config with voice settings
      const existingConfig = automation.trigger_config as Record<string, unknown> | null;
      const updatedTriggerConfig = {
        ...existingConfig,
        voice_enabled: voiceEnabled,
        voice_id: voiceId,
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
      });

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
    navigator.clipboard.writeText(editedWebhookUrl);
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
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/ai-agents')}
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
      <div className="flex flex-1 overflow-hidden">
        {/* Prompt Editor Area */}
        <div className="flex-1 p-6 overflow-auto relative">
          <div className="max-w-4xl relative">
            {/* Mentions Popup - positioned below cursor */}
            {showMentions && filteredMentions.length > 0 && (
              <div 
                ref={mentionPopupRef}
                className="absolute z-50 bg-popover border rounded-lg shadow-lg p-2 w-80 max-h-64 overflow-auto"
                style={{ top: '40px', left: '0' }}
              >
                <div className="text-xs text-muted-foreground mb-2 px-2">
                  {mentionFilter ? `Buscando "${mentionFilter}"...` : 'Selecione uma variável'}
                </div>
                <div className="space-y-0.5">
                  {filteredMentions.slice(0, 15).map((mention) => {
                    const Icon = mention.icon;
                    return (
                      <button
                        key={mention.key}
                        onClick={() => insertMention(mention.key)}
                        className="w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors flex items-start gap-2"
                      >
                        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{mention.key}</div>
                          <div className="text-xs text-muted-foreground truncate">{mention.description}</div>
                        </div>
                      </button>
                    );
                  })}
                  {filteredMentions.length > 15 && (
                    <div className="text-xs text-muted-foreground text-center py-2">
                      +{filteredMentions.length - 15} mais...
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <Textarea
              ref={textareaRef}
              value={editedPrompt}
              onChange={handlePromptChange}
              onSelect={(e) => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart || 0)}
              onBlur={() => {
                // Delay hiding to allow click on mention
                setTimeout(() => setShowMentions(false), 200);
              }}
              placeholder="Digite o prompt que define o comportamento da IA...

Use @ para inserir variáveis dinâmicas como @Nome do cliente, @departamento:Vendas, etc.

Exemplo:
REGRAS DE COMUNICAÇÃO
• Linguagem clara, educada, profissional e acolhedora
• Forneça orientações gerais e faça a triagem inicial

Você é uma atendente da empresa @Nome da empresa, especializada em atender e direcionar os clientes."
              className={cn(
                "min-h-[calc(100vh-280px)] font-mono text-sm leading-relaxed resize-none border-0 focus-visible:ring-0 p-0 bg-transparent",
                isOverLimit && "text-destructive"
              )}
            />
          </div>
        </div>

        {/* Settings Sidebar */}
        <div className="w-80 border-l bg-card overflow-auto">
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

            {/* Insert Mention */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full gap-2 mb-4">
                  <AtSign className="h-4 w-4" />
                  Inserir menção
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="start">
                <div className="text-xs text-muted-foreground mb-2">
                  Clique para inserir no prompt
                </div>
                <ScrollArea className="h-64">
                  <div className="space-y-0.5">
                    {allMentions.map((mention) => {
                      const Icon = mention.icon;
                      return (
                        <button
                          key={mention.key}
                          onClick={() => insertMention(mention.key)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors flex items-start gap-2"
                        >
                          <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{mention.key}</div>
                            <div className="text-xs text-muted-foreground truncate">{mention.description}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>

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
