import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Bot, 
  Save, 
  History, 
  Plus, 
  Trash2, 
  BookOpen, 
  Settings, 
  Folder, 
  Tags, 
  Activity,
  Loader2,
  FileText,
  AlertCircle,
  CheckCircle2,
  Copy
} from "lucide-react";
import { useTemplateBase, TemplateKnowledgeItem } from "@/hooks/useTemplateBase";
import { toast } from "sonner";

export default function GlobalAdminTemplateBase() {
  const {
    template,
    knowledgeItems,
    versions,
    isLoading,
    isLoadingVersions,
    updateTemplate,
    createVersion,
    addKnowledgeItem,
    deleteKnowledgeItem,
  } = useTemplateBase();

  const [localTemplate, setLocalTemplate] = useState<typeof template>(null);
  const [newKnowledgeItem, setNewKnowledgeItem] = useState({
    title: "",
    content: "",
    category: "general",
    item_type: "text",
    position: 0,
    is_active: true,
  });
  const [showVersionDialog, setShowVersionDialog] = useState(false);
  const [versionNotes, setVersionNotes] = useState("");
  const [showKnowledgeDialog, setShowKnowledgeDialog] = useState(false);

  // Initialize local state when template loads
  useState(() => {
    if (template && !localTemplate) {
      setLocalTemplate(template);
    }
  });

  // Update local state when template changes
  if (template && !localTemplate) {
    setLocalTemplate(template);
  }

  const handleSave = async () => {
    if (!localTemplate) return;

    await updateTemplate.mutateAsync({
      name: localTemplate.name,
      description: localTemplate.description,
      ai_provider: localTemplate.ai_provider,
      ai_prompt: localTemplate.ai_prompt,
      ai_temperature: localTemplate.ai_temperature,
      response_delay_seconds: localTemplate.response_delay_seconds,
      ai_capabilities: localTemplate.ai_capabilities,
      default_automation_name: localTemplate.default_automation_name,
      default_automation_description: localTemplate.default_automation_description,
      default_departments: localTemplate.default_departments,
      default_statuses: localTemplate.default_statuses,
      default_tags: localTemplate.default_tags,
    });
  };

  const handleCreateVersion = async () => {
    await createVersion.mutateAsync(versionNotes);
    setShowVersionDialog(false);
    setVersionNotes("");
  };

  const handleAddKnowledgeItem = async () => {
    if (!newKnowledgeItem.title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }

    await addKnowledgeItem.mutateAsync(newKnowledgeItem as Omit<TemplateKnowledgeItem, "id" | "template_id" | "created_at" | "updated_at">);
    setNewKnowledgeItem({
      title: "",
      content: "",
      category: "general",
      item_type: "text",
      position: 0,
      is_active: true,
    });
    setShowKnowledgeDialog(false);
  };

  const updateLocalField = (field: string, value: unknown) => {
    if (!localTemplate) return;
    setLocalTemplate({ ...localTemplate, [field]: value });
  };

  const updateLocalCapability = (capability: string, value: boolean) => {
    if (!localTemplate) return;
    setLocalTemplate({
      ...localTemplate,
      ai_capabilities: {
        ...localTemplate.ai_capabilities,
        [capability]: value,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!template || !localTemplate) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-yellow-500" />
        <h2 className="text-xl font-semibold">Nenhum template encontrado</h2>
        <p className="text-muted-foreground">
          O template base ainda não foi configurado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Copy className="h-6 w-6 text-primary" />
              Template Base
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure o template padrão que será clonado para cada nova empresa
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-sm">
              Versão {template.version}
            </Badge>
            <Dialog open={showVersionDialog} onOpenChange={setShowVersionDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <History className="h-4 w-4 mr-2" />
                  Nova Versão
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Nova Versão</DialogTitle>
                  <DialogDescription>
                    Isso salvará um snapshot da versão atual antes de permitir novas edições.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Label htmlFor="notes">Notas da versão (opcional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Descreva as mudanças desta versão..."
                    value={versionNotes}
                    onChange={(e) => setVersionNotes(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowVersionDialog(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateVersion} disabled={createVersion.isPending}>
                    {createVersion.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Criar Versão
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button onClick={handleSave} disabled={updateTemplate.isPending}>
              {updateTemplate.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Alterações
            </Button>
          </div>
        </div>

        <Tabs defaultValue="ai" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              IA & Prompt
            </TabsTrigger>
            <TabsTrigger value="departments" className="flex items-center gap-2">
              <Folder className="h-4 w-4" />
              Departamentos
            </TabsTrigger>
            <TabsTrigger value="statuses" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Status
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Conhecimento
            </TabsTrigger>
            <TabsTrigger value="versions" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Versões
            </TabsTrigger>
          </TabsList>

          {/* AI & Prompt Tab */}
          <TabsContent value="ai" className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Configurações Gerais
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome do Template</Label>
                    <Input
                      value={localTemplate.name}
                      onChange={(e) => updateLocalField("name", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Textarea
                      value={localTemplate.description || ""}
                      onChange={(e) => updateLocalField("description", e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Provedor de IA Padrão</Label>
                    <Select
                      value={localTemplate.ai_provider}
                      onValueChange={(value) => updateLocalField("ai_provider", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">MiauChat AI (Interno)</SelectItem>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="n8n">n8n Webhook</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Temperatura da IA ({localTemplate.ai_temperature})</Label>
                    <Slider
                      value={[localTemplate.ai_temperature || 0.7]}
                      onValueChange={([value]) => updateLocalField("ai_temperature", value)}
                      min={0}
                      max={1}
                      step={0.1}
                    />
                    <p className="text-xs text-muted-foreground">
                      Menor = mais preciso, Maior = mais criativo
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Delay de Resposta (segundos)</Label>
                    <Input
                      type="number"
                      value={localTemplate.response_delay_seconds || 2}
                      onChange={(e) => updateLocalField("response_delay_seconds", parseInt(e.target.value))}
                      min={0}
                      max={10}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    Capacidades de IA
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Resposta Automática</Label>
                      <p className="text-xs text-muted-foreground">IA responde automaticamente</p>
                    </div>
                    <Switch
                      checked={localTemplate.ai_capabilities?.auto_reply ?? true}
                      onCheckedChange={(checked) => updateLocalCapability("auto_reply", checked)}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Resumo de Conversas</Label>
                      <p className="text-xs text-muted-foreground">Gera resumos automáticos</p>
                    </div>
                    <Switch
                      checked={localTemplate.ai_capabilities?.summary ?? true}
                      onCheckedChange={(checked) => updateLocalCapability("summary", checked)}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Transcrição de Áudio</Label>
                      <p className="text-xs text-muted-foreground">Transcreve mensagens de voz</p>
                    </div>
                    <Switch
                      checked={localTemplate.ai_capabilities?.transcription ?? true}
                      onCheckedChange={(checked) => updateLocalCapability("transcription", checked)}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Classificação de Mensagens</Label>
                      <p className="text-xs text-muted-foreground">Classifica por tipo/urgência</p>
                    </div>
                    <Switch
                      checked={localTemplate.ai_capabilities?.classification ?? true}
                      onCheckedChange={(checked) => updateLocalCapability("classification", checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Prompt Padrão da IA</CardTitle>
                <CardDescription>
                  Este prompt será usado como base para todas as novas empresas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={localTemplate.ai_prompt || ""}
                  onChange={(e) => updateLocalField("ai_prompt", e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                  placeholder="Digite o prompt padrão da IA..."
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {(localTemplate.ai_prompt?.length || 0)} caracteres
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Departments Tab */}
          <TabsContent value="departments">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Folder className="h-5 w-5" />
                  Departamentos Padrão
                </CardTitle>
                <CardDescription>
                  Departamentos que serão criados automaticamente para novas empresas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {localTemplate.default_departments?.map((dept, index) => (
                    <div key={index} className="flex items-center gap-4 p-3 border rounded-lg">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: dept.color }}
                      />
                      <div className="flex-1">
                        <Input
                          value={dept.name}
                          onChange={(e) => {
                            const newDepts = [...localTemplate.default_departments];
                            newDepts[index] = { ...dept, name: e.target.value };
                            updateLocalField("default_departments", newDepts);
                          }}
                        />
                      </div>
                      <Input
                        type="color"
                        value={dept.color}
                        onChange={(e) => {
                          const newDepts = [...localTemplate.default_departments];
                          newDepts[index] = { ...dept, color: e.target.value };
                          updateLocalField("default_departments", newDepts);
                        }}
                        className="w-16 h-9 p-1 cursor-pointer"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newDepts = localTemplate.default_departments.filter((_, i) => i !== index);
                          updateLocalField("default_departments", newDepts);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() => {
                      const newDepts = [
                        ...localTemplate.default_departments,
                        { name: "Novo Departamento", color: "#6366F1", icon: "folder", position: localTemplate.default_departments.length },
                      ];
                      updateLocalField("default_departments", newDepts);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Departamento
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Statuses Tab */}
          <TabsContent value="statuses" className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Status Padrão
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {localTemplate.default_statuses?.map((status, index) => (
                      <div key={index} className="flex items-center gap-3 p-2 border rounded-lg">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                        <Input
                          value={status.name}
                          onChange={(e) => {
                            const newStatuses = [...localTemplate.default_statuses];
                            newStatuses[index] = { ...status, name: e.target.value };
                            updateLocalField("default_statuses", newStatuses);
                          }}
                          className="flex-1"
                        />
                        <Input
                          type="color"
                          value={status.color}
                          onChange={(e) => {
                            const newStatuses = [...localTemplate.default_statuses];
                            newStatuses[index] = { ...status, color: e.target.value };
                            updateLocalField("default_statuses", newStatuses);
                          }}
                          className="w-12 h-8 p-1"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const newStatuses = localTemplate.default_statuses.filter((_, i) => i !== index);
                            updateLocalField("default_statuses", newStatuses);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newStatuses = [
                          ...localTemplate.default_statuses,
                          { name: "Novo Status", color: "#6366F1", position: localTemplate.default_statuses.length },
                        ];
                        updateLocalField("default_statuses", newStatuses);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Status
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Tags className="h-5 w-5" />
                    Tags Padrão
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {localTemplate.default_tags?.map((tag, index) => (
                      <div key={index} className="flex items-center gap-3 p-2 border rounded-lg">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <Input
                          value={tag.name}
                          onChange={(e) => {
                            const newTags = [...localTemplate.default_tags];
                            newTags[index] = { ...tag, name: e.target.value };
                            updateLocalField("default_tags", newTags);
                          }}
                          className="flex-1"
                        />
                        <Input
                          type="color"
                          value={tag.color}
                          onChange={(e) => {
                            const newTags = [...localTemplate.default_tags];
                            newTags[index] = { ...tag, color: e.target.value };
                            updateLocalField("default_tags", newTags);
                          }}
                          className="w-12 h-8 p-1"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const newTags = localTemplate.default_tags.filter((_, i) => i !== index);
                            updateLocalField("default_tags", newTags);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newTags = [
                          ...localTemplate.default_tags,
                          { name: "Nova Tag", color: "#6366F1" },
                        ];
                        updateLocalField("default_tags", newTags);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Tag
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Knowledge Tab */}
          <TabsContent value="knowledge">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Base de Conhecimento do Template
                  </CardTitle>
                  <CardDescription>
                    Itens de conhecimento que serão copiados para novas empresas
                  </CardDescription>
                </div>
                <Dialog open={showKnowledgeDialog} onOpenChange={setShowKnowledgeDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Item
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Novo Item de Conhecimento</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Título</Label>
                        <Input
                          value={newKnowledgeItem.title}
                          onChange={(e) => setNewKnowledgeItem({ ...newKnowledgeItem, title: e.target.value })}
                          placeholder="Ex: Horário de funcionamento"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Categoria</Label>
                        <Select
                          value={newKnowledgeItem.category}
                          onValueChange={(value) => setNewKnowledgeItem({ ...newKnowledgeItem, category: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="general">Geral</SelectItem>
                            <SelectItem value="faq">FAQ</SelectItem>
                            <SelectItem value="policies">Políticas</SelectItem>
                            <SelectItem value="products">Produtos</SelectItem>
                            <SelectItem value="services">Serviços</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Conteúdo</Label>
                        <Textarea
                          value={newKnowledgeItem.content}
                          onChange={(e) => setNewKnowledgeItem({ ...newKnowledgeItem, content: e.target.value })}
                          rows={5}
                          placeholder="Conteúdo do item de conhecimento..."
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowKnowledgeDialog(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleAddKnowledgeItem} disabled={addKnowledgeItem.isPending}>
                        {addKnowledgeItem.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Adicionar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {knowledgeItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Nenhum item de conhecimento no template</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {knowledgeItems.map((item) => (
                      <div key={item.id} className="flex items-start gap-4 p-4 border rounded-lg">
                        <FileText className="h-5 w-5 mt-0.5 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{item.title}</h4>
                            <Badge variant="outline" className="text-xs">{item.category}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {item.content || "Sem conteúdo"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteKnowledgeItem.mutate(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Versions Tab */}
          <TabsContent value="versions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Histórico de Versões
                </CardTitle>
                <CardDescription>
                  Versões anteriores do template (não afetam empresas já criadas)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingVersions ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : versions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Nenhuma versão anterior salva</p>
                  </div>
                ) : (
                  <ScrollArea className="h-96">
                    <div className="space-y-3">
                      {versions.map((version) => (
                        <div key={version.id} className="flex items-start gap-4 p-4 border rounded-lg">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold">
                            v{version.version}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">Versão {version.version}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(version.created_at).toLocaleString("pt-BR")}
                              </span>
                            </div>
                            {version.notes && (
                              <p className="text-sm text-muted-foreground">{version.notes}</p>
                            )}
                          </div>
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
