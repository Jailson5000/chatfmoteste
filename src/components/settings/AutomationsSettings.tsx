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
import { Loader2, Plus, Trash2, Edit, Zap, Bot, Settings2 } from "lucide-react";

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

export function AutomationsSettings() {
  const { automations, isLoading, createAutomation, updateAutomation, deleteAutomation, toggleAutomation } = useAutomations();
  const { isAdmin } = useUserRole();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [formData, setFormData] = useState<AutomationFormData>(defaultFormData);

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Automações
          </CardTitle>
          <CardDescription>
            Você precisa ser administrador para gerenciar automações.
          </CardDescription>
        </CardHeader>
      </Card>
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
  };

  const handleToggle = async (automation: Automation) => {
    await toggleAutomation.mutateAsync({ id: automation.id, is_active: !automation.is_active });
  };

  const getTriggerLabel = (type: string) => {
    return TRIGGER_TYPES.find(t => t.value === type)?.label || type;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Automações N8N
            </CardTitle>
            <CardDescription>
              Configure regras para encaminhar mensagens automaticamente ao N8N
            </CardDescription>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Automação
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingAutomation ? "Editar Automação" : "Nova Automação"}
                </DialogTitle>
                <DialogDescription>
                  Configure quando e como as mensagens serão encaminhadas ao N8N
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Atendimento IA"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição (opcional)</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descrição da automação"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webhook_url">URL do Webhook N8N</Label>
                  <Input
                    id="webhook_url"
                    value={formData.webhook_url}
                    onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                    placeholder="https://seu-n8n.com/webhook/..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Deixe vazio para usar o webhook global configurado nas variáveis de ambiente
                  </p>
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
                          <div>
                            <div className="font-medium">{type.label}</div>
                            <div className="text-xs text-muted-foreground">{type.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(formData.trigger_type === "keyword_match" || formData.trigger_type === "new_message") && (
                  <div className="space-y-2">
                    <Label htmlFor="keywords">Palavras-chave (opcional)</Label>
                    <Input
                      id="keywords"
                      value={formData.keywords}
                      onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                      placeholder="ajuda, urgente, orçamento"
                    />
                    <p className="text-xs text-muted-foreground">
                      Separe as palavras por vírgula. Mensagens contendo qualquer uma dispararão a automação.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="ai_prompt">Prompt de IA (opcional)</Label>
                  <Textarea
                    id="ai_prompt"
                    value={formData.ai_prompt}
                    onChange={(e) => setFormData({ ...formData, ai_prompt: e.target.value })}
                    placeholder="Você é um assistente jurídico..."
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Será enviado ao N8N para orientar a resposta da IA
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai_temperature">Temperatura da IA: {formData.ai_temperature}</Label>
                  <Input
                    id="ai_temperature"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={formData.ai_temperature}
                    onChange={(e) => setFormData({ ...formData, ai_temperature: parseFloat(e.target.value) })}
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = mais preciso, 1 = mais criativo
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={!formData.name || createAutomation.isPending || updateAutomation.isPending}
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
      </CardHeader>

      <CardContent>
        {automations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma automação configurada</p>
            <p className="text-sm">Crie uma automação para encaminhar mensagens ao N8N automaticamente</p>
          </div>
        ) : (
          <div className="space-y-4">
            {automations.map((automation) => (
              <div
                key={automation.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-card"
              >
                <div className="flex items-center gap-4">
                  <Switch
                    checked={automation.is_active}
                    onCheckedChange={() => handleToggle(automation)}
                    disabled={toggleAutomation.isPending}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{automation.name}</span>
                      <Badge variant={automation.is_active ? "default" : "secondary"}>
                        {automation.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                      <Badge variant="outline">
                        {getTriggerLabel(automation.trigger_type)}
                      </Badge>
                    </div>
                    {automation.description && (
                      <p className="text-sm text-muted-foreground">{automation.description}</p>
                    )}
                    {automation.trigger_config?.keywords && automation.trigger_config.keywords.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Palavras-chave: {automation.trigger_config.keywords.join(", ")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenEdit(automation)}
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
                          Esta ação não pode ser desfeita. A automação "{automation.name}" será excluída permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(automation.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
