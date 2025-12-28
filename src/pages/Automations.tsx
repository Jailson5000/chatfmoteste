import { useState } from "react";
import { useAutomations, type Automation, type CreateAutomationParams, type TriggerConfig } from "@/hooks/useAutomations";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Slider } from "@/components/ui/slider";
import { Loader2, Plus, Trash2, Edit, Zap, Bot, Brain, Save, Copy, Check, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const TRIGGER_TYPES = [
  { value: "new_message", label: "Nova mensagem", description: "Dispara para toda nova mensagem recebida" },
  { value: "keyword_match", label: "Palavra-chave", description: "Dispara quando mensagem contém palavras específicas" },
  { value: "media_received", label: "Mídia recebida", description: "Dispara quando recebe imagem, áudio, vídeo ou documento" },
  { value: "first_contact", label: "Primeiro contato", description: "Dispara apenas para novos contatos" },
];

interface AutomationFormData {
  name: string;
  description: string;
  webhook_url: string;
  trigger_type: string;
  keywords: string;
  ai_prompt: string;
  ai_temperature: number;
}

const defaultFormData: AutomationFormData = {
  name: "",
  description: "",
  webhook_url: "",
  trigger_type: "new_message",
  keywords: "",
  ai_prompt: "",
  ai_temperature: 0.7,
};

export default function Automations() {
  const { automations, isLoading, createAutomation, updateAutomation, deleteAutomation, toggleAutomation } = useAutomations();
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [formData, setFormData] = useState<AutomationFormData>(defaultFormData);
  const [selectedAutomation, setSelectedAutomation] = useState<Automation | null>(null);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [editedTemperature, setEditedTemperature] = useState(0.7);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Automações IA
            </CardTitle>
            <CardDescription>
              Você precisa ser administrador para gerenciar automações.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleOpenCreate = () => {
    setFormData(defaultFormData);
    setEditingAutomation(null);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (automation: Automation) => {
    setFormData({
      name: automation.name,
      description: automation.description || "",
      webhook_url: automation.webhook_url,
      trigger_type: automation.trigger_type,
      keywords: automation.trigger_config?.keywords?.join(", ") || "",
      ai_prompt: automation.ai_prompt || "",
      ai_temperature: automation.ai_temperature || 0.7,
    });
    setEditingAutomation(automation);
    setIsCreateOpen(true);
  };

  const handleSave = async () => {
    const triggerConfig: TriggerConfig = {};
    
    if (formData.keywords.trim()) {
      triggerConfig.keywords = formData.keywords.split(",").map(k => k.trim()).filter(k => k);
    }

    const params: CreateAutomationParams = {
      name: formData.name,
      description: formData.description || undefined,
      webhook_url: formData.webhook_url,
      trigger_type: formData.trigger_type,
      trigger_config: Object.keys(triggerConfig).length > 0 ? triggerConfig : undefined,
      ai_prompt: formData.ai_prompt || undefined,
      ai_temperature: formData.ai_temperature,
      is_active: true,
    };

    if (editingAutomation) {
      await updateAutomation.mutateAsync({ id: editingAutomation.id, ...params });
    } else {
      await createAutomation.mutateAsync(params);
    }

    setIsCreateOpen(false);
    setEditingAutomation(null);
    setFormData(defaultFormData);
  };

  const handleDelete = async (id: string) => {
    await deleteAutomation.mutateAsync(id);
    if (selectedAutomation?.id === id) {
      setSelectedAutomation(null);
    }
  };

  const handleToggle = async (automation: Automation) => {
    await toggleAutomation.mutateAsync({ id: automation.id, is_active: !automation.is_active });
  };

  const handleSelectAutomation = (automation: Automation) => {
    setSelectedAutomation(automation);
    setEditedPrompt(automation.ai_prompt || "");
    setEditedTemperature(automation.ai_temperature || 0.7);
  };

  const handleSavePrompt = async () => {
    if (!selectedAutomation) return;
    
    setIsSavingPrompt(true);
    try {
      // First update in database
      await updateAutomation.mutateAsync({
        id: selectedAutomation.id,
        ai_prompt: editedPrompt,
        ai_temperature: editedTemperature,
      });
      
      // Then sync with N8N via edge function
      const { data, error } = await supabase.functions.invoke('sync-n8n-prompt', {
        body: {
          automation_id: selectedAutomation.id,
          ai_prompt: editedPrompt,
          ai_temperature: editedTemperature,
          webhook_url: selectedAutomation.webhook_url,
        }
      });

      // Update local state
      setSelectedAutomation({
        ...selectedAutomation,
        ai_prompt: editedPrompt,
        ai_temperature: editedTemperature,
      });

      if (error) {
        console.error('N8N sync error:', error);
        toast({
          title: "Prompt salvo",
          description: "Prompt atualizado no banco, mas a sincronização com N8N falhou. Tente novamente.",
          variant: "destructive",
        });
      } else if (data?.sync_status === 'synced') {
        toast({
          title: "Sincronizado com N8N",
          description: "O prompt foi atualizado e sincronizado com o N8N com sucesso.",
        });
      } else if (data?.sync_status === 'failed') {
        toast({
          title: "Prompt salvo",
          description: data.message || "Prompt atualizado, mas houve um problema na sincronização com N8N.",
        });
      } else {
        toast({
          title: "Prompt atualizado",
          description: "As alterações foram salvas.",
        });
      }
    } catch (err) {
      console.error('Save error:', err);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar o prompt. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleCopyWebhook = (webhookUrl: string, id: string) => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({
      title: "Copiado!",
      description: "URL do webhook copiada para a área de transferência.",
    });
  };

  const getTriggerLabel = (type: string) => {
    return TRIGGER_TYPES.find(t => t.value === type)?.label || type;
  };

  const hasPromptChanges = selectedAutomation && (
    editedPrompt !== (selectedAutomation.ai_prompt || "") ||
    editedTemperature !== (selectedAutomation.ai_temperature || 0.7)
  );

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            Automações IA
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure os prompts e comportamentos das IAs integradas ao N8N
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Automação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingAutomation ? "Editar Automação" : "Nova Automação"}
              </DialogTitle>
              <DialogDescription>
                Configure quando e como as mensagens serão processadas pela IA
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Atendente Jurídico"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="trigger_type">Tipo de Gatilho</Label>
                  <Select
                    value={formData.trigger_type}
                    onValueChange={(value) => setFormData({ ...formData, trigger_type: value })}
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição da automação"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook_url">URL do Webhook N8N *</Label>
                <Input
                  id="webhook_url"
                  value={formData.webhook_url}
                  onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                  placeholder="https://seu-n8n.com/webhook/..."
                />
              </div>

              {(formData.trigger_type === "keyword_match" || formData.trigger_type === "new_message") && (
                <div className="space-y-2">
                  <Label htmlFor="keywords">Palavras-chave</Label>
                  <Input
                    id="keywords"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="ajuda, urgente, orçamento"
                  />
                  <p className="text-xs text-muted-foreground">
                    Separe por vírgula. Mensagens contendo qualquer uma dispararão a automação.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="ai_prompt">Prompt da IA</Label>
                <Textarea
                  id="ai_prompt"
                  value={formData.ai_prompt}
                  onChange={(e) => setFormData({ ...formData, ai_prompt: e.target.value })}
                  placeholder="Você é um assistente jurídico especializado em direito do consumidor..."
                  rows={6}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Este prompt será enviado ao N8N para orientar as respostas da IA
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Temperatura da IA</Label>
                  <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                    {formData.ai_temperature.toFixed(1)}
                  </span>
                </div>
                <Slider
                  value={[formData.ai_temperature]}
                  onValueChange={([value]) => setFormData({ ...formData, ai_temperature: value })}
                  min={0}
                  max={1}
                  step={0.1}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Preciso</span>
                  <span>Criativo</span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSave}
                disabled={!formData.name || !formData.webhook_url || createAutomation.isPending || updateAutomation.isPending}
              >
                {(createAutomation.isPending || updateAutomation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingAutomation ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {automations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bot className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma automação configurada</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Crie sua primeira automação para integrar IA ao seu atendimento via N8N
            </p>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Automação
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Lista de Automações */}
          <div className="lg:col-span-1 space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider px-1">
              Automações ({automations.length})
            </h2>
            <div className="space-y-2">
              {automations.map((automation) => (
                <Card
                  key={automation.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedAutomation?.id === automation.id 
                      ? "ring-2 ring-primary shadow-md" 
                      : ""
                  }`}
                  onClick={() => handleSelectAutomation(automation)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Bot className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="font-medium truncate">{automation.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={automation.is_active ? "default" : "secondary"} className="text-xs">
                            {automation.is_active ? "Ativa" : "Inativa"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {getTriggerLabel(automation.trigger_type)}
                          </Badge>
                        </div>
                        {automation.description && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {automation.description}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={automation.is_active}
                        onCheckedChange={() => handleToggle(automation)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={toggleAutomation.isPending}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Editor de Prompt */}
          <div className="lg:col-span-2">
            {selectedAutomation ? (
              <Card className="h-full">
                <CardHeader className="border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        {selectedAutomation.name}
                      </CardTitle>
                      <CardDescription>
                        Configure o prompt e comportamento da IA
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(selectedAutomation)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir automação?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. A automação "{selectedAutomation.name}" será excluída.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(selectedAutomation.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Webhook URL */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                      Webhook N8N
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={selectedAutomation.webhook_url}
                        readOnly
                        className="font-mono text-xs bg-muted"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopyWebhook(selectedAutomation.webhook_url, selectedAutomation.id)}
                      >
                        {copiedId === selectedAutomation.id ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Prompt Editor */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                      Prompt da IA
                    </Label>
                    <Textarea
                      value={editedPrompt}
                      onChange={(e) => setEditedPrompt(e.target.value)}
                      placeholder="Digite o prompt que será enviado ao N8N para orientar a IA..."
                      rows={12}
                      className="font-mono text-sm resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      Este prompt será incluído no payload enviado ao N8N. Configure seu workflow para usar este campo.
                    </p>
                  </div>

                  {/* Temperature */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        Temperatura
                      </Label>
                      <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {editedTemperature.toFixed(1)}
                      </span>
                    </div>
                    <Slider
                      value={[editedTemperature]}
                      onValueChange={([value]) => setEditedTemperature(value)}
                      min={0}
                      max={1}
                      step={0.1}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Preciso (0)</span>
                      <span>Criativo (1)</span>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="pt-4 border-t">
                    <Button
                      onClick={handleSavePrompt}
                      disabled={!hasPromptChanges || isSavingPrompt}
                      className="w-full"
                    >
                      {isSavingPrompt ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Salvar e Sincronizar com N8N
                    </Button>
                    {hasPromptChanges && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 text-center mt-2">
                        Você tem alterações não salvas
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center py-16">
                  <Zap className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Selecione uma automação</h3>
                  <p className="text-muted-foreground">
                    Clique em uma automação à esquerda para editar seu prompt
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
