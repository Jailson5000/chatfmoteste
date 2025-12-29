import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAutomations, Automation, CreateAutomationParams, UpdateAutomationParams } from "@/hooks/useAutomations";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Slider } from "@/components/ui/slider";
import { Loader2, Plus, Trash2, Edit, Zap, Bot, Brain, Save, Copy, Check, RefreshCw, Wifi, WifiOff, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const TRIGGER_TYPES = [
  { value: 'new_message', label: 'Nova Mensagem Recebida' },
  { value: 'keyword', label: 'Palavra-chave Detectada' },
  { value: 'schedule', label: 'Agendamento' },
  { value: 'status_change', label: 'Mudança de Status' },
  { value: 'new_client', label: 'Novo Cliente' },
];

export default function AIAgents() {
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { automations, isLoading, createAutomation, updateAutomation, deleteAutomation, toggleAutomation } = useAutomations();
  const { toast } = useToast();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedAutomation, setSelectedAutomation] = useState<Automation | null>(null);
  
  const [newAutomation, setNewAutomation] = useState<CreateAutomationParams>({
    name: '',
    description: '',
    trigger_type: 'new_message',
    webhook_url: '',
    ai_prompt: '',
    ai_temperature: 0.7,
  });

  const [editAutomation, setEditAutomation] = useState<UpdateAutomationParams>({
    id: '',
    name: '',
    description: '',
    trigger_type: 'new_message',
    webhook_url: '',
    ai_prompt: '',
    ai_temperature: 0.7,
  });

  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedTemperature, setEditedTemperature] = useState(0.7);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>
              Você não tem permissão para acessar esta página.
            </CardDescription>
          </CardHeader>
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

  const handleCreateAutomation = async () => {
    await createAutomation.mutateAsync(newAutomation);
    setIsCreateDialogOpen(false);
    setNewAutomation({
      name: '',
      description: '',
      trigger_type: 'new_message',
      webhook_url: '',
      ai_prompt: '',
      ai_temperature: 0.7,
    });
  };

  const handleEditAutomation = async () => {
    await updateAutomation.mutateAsync(editAutomation);
    setIsEditDialogOpen(false);
  };

  const handleDeleteAutomation = async (id: string) => {
    await deleteAutomation.mutateAsync(id);
    if (selectedAutomation?.id === id) {
      setSelectedAutomation(null);
    }
  };

  const handleToggleAutomation = async (id: string, isActive: boolean) => {
    await toggleAutomation.mutateAsync({ id, is_active: isActive });
  };

  const openEditDialog = (automation: Automation) => {
    setEditAutomation({
      id: automation.id,
      name: automation.name,
      description: automation.description || '',
      trigger_type: automation.trigger_type,
      webhook_url: automation.webhook_url,
      ai_prompt: automation.ai_prompt || '',
      ai_temperature: automation.ai_temperature || 0.7,
    });
    setIsEditDialogOpen(true);
  };

  const selectAutomation = (automation: Automation) => {
    setSelectedAutomation(automation);
    setEditedPrompt(automation.ai_prompt || '');
    setEditedTemperature(automation.ai_temperature || 0.7);
  };

  const handleSavePrompt = async () => {
    if (!selectedAutomation) return;

    setIsSavingPrompt(true);
    try {
      // 1) Persistir no banco
      await updateAutomation.mutateAsync({
        id: selectedAutomation.id,
        ai_prompt: editedPrompt,
        ai_temperature: editedTemperature,
      });

      // 2) Sincronizar com N8N
      const { error: syncError } = await supabase.functions.invoke('sync-n8n-prompt', {
        body: {
          automation_id: selectedAutomation.id,
          ai_prompt: editedPrompt,
          ai_temperature: editedTemperature,
          webhook_url: selectedAutomation.webhook_url,
        },
      });

      if (syncError) {
        console.error('Error syncing prompt:', syncError);
        toast({
          title: "Prompt salvo",
          description: "Salvo no sistema, mas não foi possível sincronizar com o N8N.",
        });
      } else {
        toast({
          title: "Prompt salvo e sincronizado",
          description: "As configurações foram salvas e enviadas para o N8N.",
        });
      }

      setSelectedAutomation({
        ...selectedAutomation,
        ai_prompt: editedPrompt,
        ai_temperature: editedTemperature,
      });
    } catch (error) {
      console.error('Error saving prompt:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar o prompt. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleCopyWebhook = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast({
      title: "URL copiada",
      description: "A URL do webhook foi copiada para a área de transferência.",
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getTriggerLabel = (type: string) => {
    return TRIGGER_TYPES.find(t => t.value === type)?.label || type;
  };

  const handleTestConnection = async (webhookUrl: string) => {
    setIsTestingConnection(true);
    setConnectionStatus('idle');
    
    try {
      const testPayload = {
        event: 'connection_test',
        timestamp: new Date().toISOString(),
        message: 'Teste de conexão do MiauChat',
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload),
      });

      if (response.ok) {
        setConnectionStatus('success');
        toast({
          title: "Conexão bem-sucedida!",
          description: "O webhook do N8N está respondendo corretamente.",
        });
      } else {
        setConnectionStatus('error');
        toast({
          title: "Erro na conexão",
          description: `O webhook retornou status ${response.status}. Verifique a URL e se o workflow está ativo.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      setConnectionStatus('error');
      toast({
        title: "Falha na conexão",
        description: "Não foi possível conectar ao webhook. Verifique a URL e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsTestingConnection(false);
      setTimeout(() => setConnectionStatus('idle'), 3000);
    }
  };

  const hasPromptChanges = selectedAutomation && (
    editedPrompt !== (selectedAutomation.ai_prompt || '') ||
    editedTemperature !== (selectedAutomation.ai_temperature || 0.7)
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agentes de IA</h1>
          <p className="text-muted-foreground">
            Configure e gerencie seus agentes de IA para atendimento automatizado
          </p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Agente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Criar Novo Agente de IA</DialogTitle>
              <DialogDescription>
                Configure um novo agente de IA para automatizar seus atendimentos.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome do Agente</Label>
                <Input
                  id="name"
                  value={newAutomation.name}
                  onChange={(e) => setNewAutomation({ ...newAutomation, name: e.target.value })}
                  placeholder="Ex: Atendimento Inicial"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={newAutomation.description || ''}
                  onChange={(e) => setNewAutomation({ ...newAutomation, description: e.target.value })}
                  placeholder="Descreva o que este agente faz..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="trigger">Gatilho</Label>
                <Select
                  value={newAutomation.trigger_type}
                  onValueChange={(value) => setNewAutomation({ ...newAutomation, trigger_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o gatilho" />
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
              <div className="grid gap-2">
                <Label htmlFor="webhook">URL do Webhook (N8N)</Label>
                <Input
                  id="webhook"
                  value={newAutomation.webhook_url}
                  onChange={(e) => setNewAutomation({ ...newAutomation, webhook_url: e.target.value })}
                  placeholder="https://n8n.exemplo.com/webhook/..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleCreateAutomation}
                disabled={!newAutomation.name || !newAutomation.webhook_url || createAutomation.isPending}
              >
                {createAutomation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Agente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Agentes */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Agentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {automations?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum agente criado ainda
                </p>
              ) : (
                automations?.map((automation) => (
                  <div
                    key={automation.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedAutomation?.id === automation.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => selectAutomation(automation)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className={`h-4 w-4 ${automation.is_active ? 'text-green-500' : 'text-muted-foreground'}`} />
                        <span className="font-medium text-sm">{automation.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/ai-agents/${automation.id}/edit`);
                          }}
                          title="Editar agente"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(automation);
                          }}
                          title="Configurações rápidas"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir Agente</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir "{automation.name}"? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteAutomation(automation.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {getTriggerLabel(automation.trigger_type)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Editor de Prompt */}
        <div className="lg:col-span-2">
          {selectedAutomation ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5" />
                      {selectedAutomation.name}
                    </CardTitle>
                    <CardDescription>
                      {selectedAutomation.description || 'Configure o comportamento da IA'}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="active" className="text-sm">Ativo</Label>
                    <Switch
                      id="active"
                      checked={selectedAutomation.is_active}
                      onCheckedChange={(checked) => handleToggleAutomation(selectedAutomation.id, checked)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Webhook URL */}
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value={selectedAutomation.webhook_url}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopyWebhook(selectedAutomation.webhook_url, selectedAutomation.id)}
                      title="Copiar URL"
                    >
                      {copiedId === selectedAutomation.id ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleTestConnection(selectedAutomation.webhook_url)}
                      disabled={isTestingConnection}
                      title="Testar conexão"
                      className={
                        connectionStatus === 'success' 
                          ? 'border-green-500 text-green-500' 
                          : connectionStatus === 'error' 
                            ? 'border-destructive text-destructive' 
                            : ''
                      }
                    >
                      {isTestingConnection ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : connectionStatus === 'success' ? (
                        <Wifi className="h-4 w-4 text-green-500" />
                      ) : connectionStatus === 'error' ? (
                        <WifiOff className="h-4 w-4" />
                      ) : (
                        <Wifi className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Clique no ícone de Wi-Fi para testar a conexão com o webhook
                  </p>
                </div>

                {/* Prompt Editor */}
                <div className="space-y-2">
                  <Label htmlFor="prompt">Prompt da IA</Label>
                  <Textarea
                    id="prompt"
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    placeholder="Digite o prompt que define o comportamento da IA..."
                    className="min-h-[200px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Este prompt será enviado ao N8N e definirá como a IA se comporta nas conversas.
                  </p>
                </div>

                {/* Temperature */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Temperatura: {editedTemperature.toFixed(1)}</Label>
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
                    Valores mais baixos tornam a IA mais focada e determinística. Valores mais altos tornam as respostas mais criativas e variadas.
                  </p>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={handleSavePrompt}
                    disabled={!hasPromptChanges || isSavingPrompt}
                  >
                    {isSavingPrompt ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar e Sincronizar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-[400px] text-center">
                <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Selecione um Agente</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Escolha um agente na lista à esquerda para configurar seu comportamento
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Editar Agente</DialogTitle>
            <DialogDescription>
              Atualize as configurações básicas do agente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome do Agente</Label>
              <Input
                id="edit-name"
                value={editAutomation.name}
                onChange={(e) => setEditAutomation({ ...editAutomation, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                value={editAutomation.description || ''}
                onChange={(e) => setEditAutomation({ ...editAutomation, description: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-trigger">Gatilho</Label>
              <Select
                value={editAutomation.trigger_type}
                onValueChange={(value) => setEditAutomation({ ...editAutomation, trigger_type: value })}
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
            <div className="grid gap-2">
              <Label htmlFor="edit-webhook">URL do Webhook (N8N)</Label>
              <Input
                id="edit-webhook"
                value={editAutomation.webhook_url}
                onChange={(e) => setEditAutomation({ ...editAutomation, webhook_url: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleEditAutomation}
              disabled={!editAutomation.name || !editAutomation.webhook_url || updateAutomation.isPending}
            >
              {updateAutomation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
