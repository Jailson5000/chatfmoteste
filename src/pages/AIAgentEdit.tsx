import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAutomations, Automation } from "@/hooks/useAutomations";
import { useUserRole } from "@/hooks/useUserRole";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const TRIGGER_TYPES = [
  { value: 'new_message', label: 'Nova Mensagem Recebida' },
  { value: 'keyword', label: 'Palavra-chave Detectada' },
  { value: 'schedule', label: 'Agendamento' },
  { value: 'status_change', label: 'Mudança de Status' },
  { value: 'new_client', label: 'Novo Cliente' },
];

const MAX_PROMPT_CHARS = 5000;

// Available mention variables
const MENTION_VARIABLES = [
  { key: '@Nome do escritório', description: 'Nome do escritório de advocacia' },
  { key: '@Nome do cliente', description: 'Nome do cliente na conversa' },
  { key: '@Atendimento', description: 'Departamento de atendimento' },
  { key: '@Advogado responsável', description: 'Nome do advogado responsável' },
  { key: '@Data atual', description: 'Data atual formatada' },
  { key: '@Hora atual', description: 'Hora atual formatada' },
  { key: '@Ativar áudio', description: 'Comando para ativar resposta por áudio' },
  { key: '@Desativar áudio', description: 'Comando para desativar resposta por áudio' },
  { key: '@bemvindo', description: 'Template de boas-vindas' },
];

export default function AIAgentEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { automations, isLoading, updateAutomation, refetch } = useAutomations();
  const { toast } = useToast();

  const [automation, setAutomation] = useState<Automation | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedTemperature, setEditedTemperature] = useState(0.7);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedWebhookUrl, setEditedWebhookUrl] = useState('');
  const [editedTriggerType, setEditedTriggerType] = useState('new_message');
  const [isActive, setIsActive] = useState(true);
  
  const [isSaving, setIsSaving] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

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
      }
    }
  }, [automations, id]);

  const insertMention = useCallback((mention: string) => {
    const before = editedPrompt.slice(0, cursorPosition);
    const after = editedPrompt.slice(cursorPosition);
    const newPrompt = before + mention + ' ' + after;
    setEditedPrompt(newPrompt);
    setShowMentions(false);
  }, [editedPrompt, cursorPosition]);

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const pos = e.target.selectionStart || 0;
    setEditedPrompt(value);
    setCursorPosition(pos);
    
    // Check if @ was typed
    if (value[pos - 1] === '@') {
      setShowMentions(true);
    } else {
      setShowMentions(false);
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

  const hasChanges = 
    editedPrompt !== (automation.ai_prompt || '') ||
    editedTemperature !== (automation.ai_temperature || 0.7) ||
    editedName !== automation.name ||
    editedDescription !== (automation.description || '') ||
    editedWebhookUrl !== automation.webhook_url ||
    editedTriggerType !== automation.trigger_type ||
    isActive !== automation.is_active;

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
          message: 'Teste de conexão do FMO Inbox',
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
          <div className="max-w-4xl">
            {/* Mentions Popup */}
            {showMentions && (
              <div className="absolute z-50 bg-popover border rounded-lg shadow-lg p-2 w-64">
                <ScrollArea className="h-48">
                  <div className="space-y-1">
                    {MENTION_VARIABLES.map((mention) => (
                      <button
                        key={mention.key}
                        onClick={() => insertMention(mention.key)}
                        className="w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors"
                      >
                        <div className="font-medium text-sm">{mention.key}</div>
                        <div className="text-xs text-muted-foreground">{mention.description}</div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
            
            <Textarea
              value={editedPrompt}
              onChange={handlePromptChange}
              onSelect={(e) => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart || 0)}
              placeholder="Digite o prompt que define o comportamento da IA...

Use @ para inserir variáveis dinâmicas como @Nome do cliente, @Atendimento, etc.

Exemplo:
REGRAS DE COMUNICAÇÃO
• Linguagem clara, educada, profissional e acolhedora
• Nunca dê parecer jurídico definitivo — apenas orientação e triagem

Você é uma atendente do escritório @Nome do escritório , especializada em identificar se o cliente tem direito à revisão de aposentadoria."
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
              <PopoverContent className="w-64 p-2" align="start">
                <ScrollArea className="h-48">
                  <div className="space-y-1">
                    {MENTION_VARIABLES.map((mention) => (
                      <button
                        key={mention.key}
                        onClick={() => insertMention(mention.key)}
                        className="w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors"
                      >
                        <div className="font-medium text-sm">{mention.key}</div>
                        <div className="text-xs text-muted-foreground">{mention.description}</div>
                      </button>
                    ))}
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

            {/* Knowledge Base placeholder */}
            <div className="space-y-2 mb-4">
              <Label className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Base de Conhecimento
              </Label>
              <div className="p-3 rounded-lg border border-dashed border-muted-foreground/25 text-center">
                <p className="text-xs text-muted-foreground">
                  Vincule documentos e itens de conhecimento ao agente (em breve)
                </p>
              </div>
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
