import { useState, useRef, useEffect } from "react";
import {
  Building2,
  Users,
  Shield,
  Bell,
  Database,
  FileText,
  Save,
  Tag,
  Layers,
  Folder,
  Plus,
  Trash2,
  GripVertical,
  Upload,
  MessageSquareText,
  Image,
  Video,
  Mic,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useTags } from "@/hooks/useTags";
import { useDepartments } from "@/hooks/useDepartments";
import { useTemplates } from "@/hooks/useTemplates";
import { useLawFirm } from "@/hooks/useLawFirm";
import { ColorPicker } from "@/components/ui/color-picker";

const teamMembers = [
  { id: "1", name: "Dr. Carlos Mendes", email: "carlos@escritorio.com", role: "admin", oab: "OAB/SP 123456" },
  { id: "2", name: "Dra. Fernanda Lima", email: "fernanda@escritorio.com", role: "advogado", oab: "OAB/SP 234567" },
  { id: "3", name: "Dr. Roberto Alves", email: "roberto@escritorio.com", role: "advogado", oab: "OAB/SP 345678" },
  { id: "4", name: "Ana Silva", email: "ana@escritorio.com", role: "estagiario", oab: null },
  { id: "5", name: "João Santos", email: "joao@escritorio.com", role: "atendente", oab: null },
];

const roleLabels = {
  admin: { label: "Administrador", color: "bg-primary text-primary-foreground" },
  advogado: { label: "Advogado", color: "bg-accent text-accent-foreground" },
  estagiario: { label: "Estagiário", color: "bg-secondary text-secondary-foreground" },
  atendente: { label: "Atendente", color: "bg-muted text-muted-foreground" },
};

const templateTypes = [
  { value: "text", label: "Texto", icon: MessageSquareText },
  { value: "image", label: "Imagem", icon: Image },
  { value: "video", label: "Vídeo", icon: Video },
  { value: "audio", label: "Áudio", icon: Mic },
];

export default function Settings() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  
  // Law firm data
  const { lawFirm, updateLawFirm, uploadLogo } = useLawFirm();
  const [officeName, setOfficeName] = useState("");
  const [officeCnpj, setOfficeCnpj] = useState("");
  const [officePhone, setOfficePhone] = useState("");
  const [officeEmail, setOfficeEmail] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  
  // Status management
  const { statuses, createStatus, deleteStatus } = useCustomStatuses();
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#6366f1");
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  
  // Tags management
  const { tags, createTag, deleteTag } = useTags();
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  
  // Departments management
  const { departments, createDepartment, deleteDepartment, reorderDepartments } = useDepartments();
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptColor, setNewDeptColor] = useState("#6366f1");
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [draggedDept, setDraggedDept] = useState<string | null>(null);

  // Templates management
  const { templates, createTemplate, deleteTemplate } = useTemplates();
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateShortcut, setNewTemplateShortcut] = useState("");
  const [newTemplateContent, setNewTemplateContent] = useState("");
  const [newTemplateType, setNewTemplateType] = useState("text");
  const [newTemplateMediaUrl, setNewTemplateMediaUrl] = useState("");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  // Initialize form with law firm data
  useEffect(() => {
    if (lawFirm) {
      setOfficeName(lawFirm.name || "");
      setOfficeCnpj(lawFirm.document || "");
      setOfficePhone(lawFirm.phone || "");
      setOfficeEmail(lawFirm.email || "");
      setOfficeAddress(lawFirm.address || "");
    }
  }, [lawFirm]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateLawFirm.mutateAsync({
        name: officeName,
        document: officeCnpj,
        phone: officePhone,
        email: officeEmail,
        address: officeAddress,
      });
    } catch (error) {
      // Error handled by mutation
    }
    setSaving(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadLogo.mutateAsync(file);
    }
  };

  const handleCreateStatus = async () => {
    if (!newStatusName.trim()) return;
    await createStatus.mutateAsync({ name: newStatusName, color: newStatusColor });
    setNewStatusName("");
    setNewStatusColor("#6366f1");
    setStatusDialogOpen(false);
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    await createTag.mutateAsync({ name: newTagName, color: newTagColor });
    setNewTagName("");
    setNewTagColor("#6366f1");
    setTagDialogOpen(false);
  };

  const handleCreateDepartment = async () => {
    if (!newDeptName.trim()) return;
    await createDepartment.mutateAsync({ name: newDeptName, color: newDeptColor });
    setNewDeptName("");
    setNewDeptColor("#6366f1");
    setDeptDialogOpen(false);
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateShortcut.trim()) return;
    
    // For media templates, require media URL; for text, require content
    if (newTemplateType === "text" && !newTemplateContent.trim()) return;
    if (newTemplateType !== "text" && !newTemplateMediaUrl.trim()) return;
    
    const content = newTemplateType === "text" 
      ? newTemplateContent 
      : `[${newTemplateType.toUpperCase()}]${newTemplateMediaUrl}${newTemplateContent ? `\n${newTemplateContent}` : ""}`;
    
    await createTemplate.mutateAsync({ 
      name: newTemplateName, 
      shortcut: newTemplateShortcut, 
      content: content,
      category: newTemplateType,
    });
    setNewTemplateName("");
    setNewTemplateShortcut("");
    setNewTemplateContent("");
    setNewTemplateType("text");
    setNewTemplateMediaUrl("");
    setTemplateDialogOpen(false);
  };

  const handleDeptDragStart = (id: string) => {
    setDraggedDept(id);
  };

  const handleDeptDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDeptDrop = (targetId: string) => {
    if (!draggedDept || draggedDept === targetId) return;
    
    const orderedIds = [...departments].map(d => d.id);
    const draggedIndex = orderedIds.indexOf(draggedDept);
    const targetIndex = orderedIds.indexOf(targetId);
    
    orderedIds.splice(draggedIndex, 1);
    orderedIds.splice(targetIndex, 0, draggedDept);
    
    reorderDepartments.mutate(orderedIds);
    setDraggedDept(null);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Configurações</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seu escritório, equipe e preferências
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>

      <Tabs defaultValue="status">
        <TabsList className="grid w-full max-w-5xl grid-cols-9">
          <TabsTrigger value="status">
            <Layers className="h-4 w-4 mr-2" />
            Status
          </TabsTrigger>
          <TabsTrigger value="tags">
            <Tag className="h-4 w-4 mr-2" />
            Etiquetas
          </TabsTrigger>
          <TabsTrigger value="departments">
            <Folder className="h-4 w-4 mr-2" />
            Departamentos
          </TabsTrigger>
          <TabsTrigger value="templates">
            <MessageSquareText className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="office">
            <Building2 className="h-4 w-4 mr-2" />
            Escritório
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="h-4 w-4 mr-2" />
            Equipe
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="h-4 w-4 mr-2" />
            Segurança
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notificações
          </TabsTrigger>
          <TabsTrigger value="lgpd">
            <FileText className="h-4 w-4 mr-2" />
            LGPD
          </TabsTrigger>
        </TabsList>

        {/* Status Settings */}
        <TabsContent value="status" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Status Personalizados</CardTitle>
                  <CardDescription>
                    Crie status para classificar seus clientes (ex: Análise, Qualificado, Proposta Aceita)
                  </CardDescription>
                </div>
                <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Status
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Criar Status</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>Nome do Status</Label>
                        <Input
                          value={newStatusName}
                          onChange={(e) => setNewStatusName(e.target.value)}
                          placeholder="Ex: Qualificado"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Cor</Label>
                        <ColorPicker value={newStatusColor} onChange={setNewStatusColor} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
                          Cancelar
                        </Button>
                        <Button onClick={handleCreateStatus} disabled={createStatus.isPending}>
                          {createStatus.isPending ? "Criando..." : "Criar"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {statuses.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum status criado</p>
                  <p className="text-sm">Clique em "Novo Status" para adicionar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {statuses.map((status) => (
                    <div
                      key={status.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                        <span className="font-medium">{status.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteStatus.mutate(status.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tags Settings */}
        <TabsContent value="tags" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Etiquetas</CardTitle>
                  <CardDescription>
                    Crie etiquetas para organizar e filtrar seus clientes
                  </CardDescription>
                </div>
                <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Nova Etiqueta
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Criar Etiqueta</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>Nome da Etiqueta</Label>
                        <Input
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          placeholder="Ex: VIP"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Cor</Label>
                        <ColorPicker value={newTagColor} onChange={setNewTagColor} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setTagDialogOpen(false)}>
                          Cancelar
                        </Button>
                        <Button onClick={handleCreateTag} disabled={createTag.isPending}>
                          {createTag.isPending ? "Criando..." : "Criar"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {tags.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma etiqueta criada</p>
                  <p className="text-sm">Clique em "Nova Etiqueta" para adicionar</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      className="flex items-center gap-2 px-3 py-1.5"
                      style={{ backgroundColor: tag.color, color: "#fff" }}
                    >
                      {tag.name}
                      <button
                        className="ml-1 hover:opacity-70"
                        onClick={() => deleteTag.mutate(tag.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Departments Settings */}
        <TabsContent value="departments" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Departamentos</CardTitle>
                  <CardDescription>
                    Departamentos aparecem como colunas no Kanban. Arraste para reordenar.
                  </CardDescription>
                </div>
                <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Departamento
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Criar Departamento</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>Nome do Departamento</Label>
                        <Input
                          value={newDeptName}
                          onChange={(e) => setNewDeptName(e.target.value)}
                          placeholder="Ex: Comercial"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Cor</Label>
                        <ColorPicker value={newDeptColor} onChange={setNewDeptColor} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDeptDialogOpen(false)}>
                          Cancelar
                        </Button>
                        <Button onClick={handleCreateDepartment} disabled={createDepartment.isPending}>
                          {createDepartment.isPending ? "Criando..." : "Criar"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {departments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum departamento criado</p>
                  <p className="text-sm">Clique em "Novo Departamento" para adicionar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {departments.map((dept) => (
                    <div
                      key={dept.id}
                      draggable
                      onDragStart={() => handleDeptDragStart(dept.id)}
                      onDragOver={handleDeptDragOver}
                      onDrop={() => handleDeptDrop(dept.id)}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-grab active:cursor-grabbing transition-opacity ${
                        draggedDept === dept.id ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: dept.color }}
                        />
                        <span className="font-medium">{dept.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteDepartment.mutate(dept.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Settings */}
        <TabsContent value="templates" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Templates de Mensagem</CardTitle>
                  <CardDescription>
                    Crie mensagens rápidas que podem ser usadas com comandos (ex: /a para aplicar)
                  </CardDescription>
                </div>
                <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Template
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Criar Template</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>Tipo de Template</Label>
                        <div className="grid grid-cols-4 gap-2">
                          {templateTypes.map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => setNewTemplateType(type.value)}
                              className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                                newTemplateType === type.value 
                                  ? "border-primary bg-primary/10" 
                                  : "border-border hover:border-primary/50"
                              }`}
                            >
                              <type.icon className={`h-5 w-5 ${newTemplateType === type.value ? "text-primary" : "text-muted-foreground"}`} />
                              <span className={`text-xs ${newTemplateType === type.value ? "text-primary font-medium" : "text-muted-foreground"}`}>
                                {type.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Nome do Template</Label>
                        <Input
                          value={newTemplateName}
                          onChange={(e) => setNewTemplateName(e.target.value)}
                          placeholder="Ex: Boas-vindas"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Atalho (comando)</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">/</span>
                          <Input
                            value={newTemplateShortcut}
                            onChange={(e) => setNewTemplateShortcut(e.target.value.toLowerCase().replace(/\s/g, ""))}
                            placeholder="boasvindas"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">Use /{newTemplateShortcut || "comando"} para aplicar</p>
                      </div>
                      
                      {newTemplateType !== "text" && (
                        <div className="space-y-2">
                          <Label>URL da Mídia ({newTemplateType === "image" ? "Imagem" : newTemplateType === "video" ? "Vídeo" : "Áudio"})</Label>
                          <Input
                            value={newTemplateMediaUrl}
                            onChange={(e) => setNewTemplateMediaUrl(e.target.value)}
                            placeholder={`https://exemplo.com/${newTemplateType === "image" ? "imagem.jpg" : newTemplateType === "video" ? "video.mp4" : "audio.mp3"}`}
                          />
                          <p className="text-xs text-muted-foreground">
                            {newTemplateType === "image" && "Formatos suportados: JPG, PNG, GIF, WebP"}
                            {newTemplateType === "video" && "Formatos suportados: MP4, WebM"}
                            {newTemplateType === "audio" && "Formatos suportados: MP3, OGG, AAC"}
                          </p>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <Label>{newTemplateType === "text" ? "Conteúdo da Mensagem" : "Legenda (opcional)"}</Label>
                        <Textarea
                          value={newTemplateContent}
                          onChange={(e) => setNewTemplateContent(e.target.value)}
                          placeholder={newTemplateType === "text" ? "Olá! Seja bem-vindo ao nosso escritório..." : "Legenda para a mídia..."}
                          rows={newTemplateType === "text" ? 4 : 2}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
                          Cancelar
                        </Button>
                        <Button onClick={handleCreateTemplate} disabled={createTemplate.isPending}>
                          {createTemplate.isPending ? "Criando..." : "Criar"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquareText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum template criado</p>
                  <p className="text-sm">Clique em "Novo Template" para adicionar</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {templates.map((template) => {
                    const templateType = templateTypes.find(t => t.value === template.category) || templateTypes[0];
                    const TypeIcon = templateType.icon;
                    return (
                      <div
                        key={template.id}
                        className="flex items-start justify-between p-4 rounded-lg border"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-muted">
                            <TypeIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">{template.name}</span>
                              <Badge variant="secondary" className="text-xs">
                                /{template.shortcut}
                              </Badge>
                              <Badge variant="outline" className="text-xs capitalize">
                                {templateType.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {template.content.startsWith("[") 
                                ? template.content.split("\n").slice(1).join("\n") || "Mídia anexada"
                                : template.content
                              }
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive ml-2"
                          onClick={() => deleteTemplate.mutate(template.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Office Settings */}
        <TabsContent value="office" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Logo da Empresa</CardTitle>
              <CardDescription>
                Faça upload do logo que será exibido no sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-xl border-2 border-dashed flex items-center justify-center bg-muted/50 overflow-hidden">
                  {lawFirm?.logo_url ? (
                    <img 
                      src={lawFirm.logo_url} 
                      alt="Logo" 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Image className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    ref={logoInputRef}
                    onChange={handleLogoUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadLogo.isPending}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadLogo.isPending ? "Enviando..." : "Alterar Logo"}
                  </Button>
                  <p className="text-sm text-muted-foreground mt-2">PNG, JPG ou SVG. Max 2MB.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dados do Escritório</CardTitle>
              <CardDescription>
                Informações básicas do seu escritório de advocacia
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="office-name">Nome da Empresa</Label>
                  <Input 
                    id="office-name" 
                    placeholder="Escritório de Advocacia" 
                    value={officeName}
                    onChange={(e) => setOfficeName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="office-cnpj">CNPJ</Label>
                  <Input 
                    id="office-cnpj" 
                    placeholder="00.000.000/0001-00" 
                    value={officeCnpj}
                    onChange={(e) => setOfficeCnpj(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="office-phone">Telefone</Label>
                  <Input 
                    id="office-phone" 
                    placeholder="(11) 3000-0000" 
                    value={officePhone}
                    onChange={(e) => setOfficePhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="office-email">Email</Label>
                  <Input 
                    id="office-email" 
                    type="email" 
                    placeholder="contato@escritorio.com" 
                    value={officeEmail}
                    onChange={(e) => setOfficeEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="office-address">Endereço</Label>
                <Textarea 
                  id="office-address" 
                  placeholder="Rua, número, bairro, cidade - UF" 
                  value={officeAddress}
                  onChange={(e) => setOfficeAddress(e.target.value)}
                />
              </div>
              <div className="flex justify-end pt-4 border-t">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Settings */}
        <TabsContent value="team" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Membros da Equipe</CardTitle>
                  <CardDescription>
                    Gerencie os usuários e suas permissões
                  </CardDescription>
                </div>
                <Button>
                  <Users className="h-4 w-4 mr-2" />
                  Convidar membro
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>OAB</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>
                        <Badge className={roleLabels[member.role as keyof typeof roleLabels].color}>
                          {roleLabels[member.role as keyof typeof roleLabels].label}
                        </Badge>
                      </TableCell>
                      <TableCell>{member.oab || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Configurações de Segurança</CardTitle>
              <CardDescription>
                Controles de acesso e auditoria
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Autenticação em dois fatores</Label>
                  <p className="text-sm text-muted-foreground">
                    Exigir 2FA para todos os advogados
                  </p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Logs de acesso</Label>
                  <p className="text-sm text-muted-foreground">
                    Registrar todas as ações dos usuários
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Criptografia de documentos</Label>
                  <p className="text-sm text-muted-foreground">
                    Criptografar arquivos em repouso
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="space-y-2">
                <Label>Tempo de sessão</Label>
                <Select defaultValue="60">
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Selecione o tempo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutos</SelectItem>
                    <SelectItem value="60">1 hora</SelectItem>
                    <SelectItem value="120">2 horas</SelectItem>
                    <SelectItem value="480">8 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Preferências de Notificação</CardTitle>
              <CardDescription>
                Configure quando e como você quer ser notificado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Nova conversa</Label>
                  <p className="text-sm text-muted-foreground">
                    Notificar quando um novo cliente entrar em contato
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Transferência para advogado</Label>
                  <p className="text-sm text-muted-foreground">
                    Notificar quando a IA transferir para humano
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Documentos recebidos</Label>
                  <p className="text-sm text-muted-foreground">
                    Notificar quando um cliente enviar documentos
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Resumo diário</Label>
                  <p className="text-sm text-muted-foreground">
                    Receber um resumo das atividades do dia
                  </p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LGPD */}
        <TabsContent value="lgpd" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Conformidade LGPD</CardTitle>
              <CardDescription>
                Configurações de privacidade e proteção de dados
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Consentimento obrigatório</Label>
                  <p className="text-sm text-muted-foreground">
                    Exigir aceite de termos antes do atendimento
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consent-text">Texto de consentimento</Label>
                <Textarea
                  id="consent-text"
                  rows={4}
                  placeholder="Ao continuar, você concorda com..."
                  defaultValue="Ao continuar com este atendimento, você autoriza a coleta e processamento dos seus dados pessoais exclusivamente para fins de prestação de serviços jurídicos, conforme a Lei Geral de Proteção de Dados (LGPD)."
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Retenção de dados</Label>
                  <p className="text-sm text-muted-foreground">
                    Período de retenção das conversas
                  </p>
                </div>
                <Select defaultValue="5years">
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Selecione o período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1year">1 ano</SelectItem>
                    <SelectItem value="3years">3 anos</SelectItem>
                    <SelectItem value="5years">5 anos</SelectItem>
                    <SelectItem value="10years">10 anos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Mascaramento de dados</Label>
                  <p className="text-sm text-muted-foreground">
                    Ocultar dados sensíveis em logs
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Solicitações de Dados
              </CardTitle>
              <CardDescription>
                Gerencie solicitações de exclusão ou portabilidade
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma solicitação pendente</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
