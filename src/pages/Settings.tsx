import { useState, useRef } from "react";
import {
  Building2,
  Users,
  Shield,
  FileText,
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
  Pencil,
  Loader2,
  Plug,
  Database,
  CreditCard,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useTags } from "@/hooks/useTags";
import { useDepartments } from "@/hooks/useDepartments";
import { useTemplates } from "@/hooks/useTemplates";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { ColorPicker } from "@/components/ui/color-picker";
import { EditableItem } from "@/components/settings/EditableItem";
import { EditableTemplate } from "@/components/settings/EditableTemplate";
import { InviteMemberDialog } from "@/components/admin/InviteMemberDialog";
import { IntegrationsSettings } from "@/components/settings/IntegrationsSettings";
import { ClassesSubTabs } from "@/components/settings/ClassesSubTabs";
import { GeneralInfoSettings } from "@/components/settings/GeneralInfoSettings";
import { SettingsHelpCollapsible } from "@/components/settings/SettingsHelpCollapsible";
import { SecuritySubTabs } from "@/components/settings/SecuritySubTabs";
import { MyPlanSettings } from "@/components/settings/MyPlanSettings";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/useUserRole";

const roleLabels: Record<string, { label: string; color: string }> = {
  admin: { label: "Administrador", color: "bg-primary text-primary-foreground" },
  gerente: { label: "Gerente", color: "bg-blue-500 text-white" },
  advogado: { label: "Supervisor", color: "bg-amber-500 text-white" },
  estagiario: { label: "Supervisor", color: "bg-amber-500 text-white" },
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
  
  // Law firm data
  const { lawFirm, updateLawFirm, uploadLogo } = useLawFirm();
  
  // Status management
  const { statuses, createStatus, updateStatus, deleteStatus } = useCustomStatuses();
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#6366f1");
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  
  // Tags management
  const { tags, createTag, updateTag, deleteTag } = useTags();
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  
  // Departments management
  const { departments, createDepartment, updateDepartment, deleteDepartment, reorderDepartments } = useDepartments();
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptColor, setNewDeptColor] = useState("#6366f1");
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [draggedDept, setDraggedDept] = useState<string | null>(null);

  // Templates management
  const { templates, createTemplate, updateTemplate, deleteTemplate } = useTemplates();
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateShortcut, setNewTemplateShortcut] = useState("");
  const [newTemplateContent, setNewTemplateContent] = useState("");
  const [newTemplateType, setNewTemplateType] = useState("text");
  const [newTemplateMediaUrl, setNewTemplateMediaUrl] = useState("");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const templateMediaInputRef = useRef<HTMLInputElement>(null);

  // Team management
  const { members: teamMembers, isLoading: teamLoading, inviteMember, updateMemberRole, updateMemberDepartments, updateMemberAccessFlags, removeMember } = useTeamMembers();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editMemberRole, setEditMemberRole] = useState<AppRole>("atendente");
  const [editMemberDepts, setEditMemberDepts] = useState<string[]>([]);
  const [editMemberCanAccessArchived, setEditMemberCanAccessArchived] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  
  // Special ID for "No Department" option in UI (NOT a real UUID)
  const NO_DEPARTMENT_ID = "__no_department__";

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
  const handleTemplateMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar que lawFirm existe para conformidade com RLS
    if (!lawFirm?.id) {
      toast({
        title: "Erro",
        description: "Não foi possível identificar a empresa. Recarregue a página.",
        variant: "destructive",
      });
      return;
    }

    setUploadingMedia(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${lawFirm.id}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('template-media')
        .upload(filePath, file);

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('template-media')
        .getPublicUrl(filePath);

      setNewTemplateMediaUrl(urlData.publicUrl);
      toast({
        title: "Upload concluído",
        description: "Arquivo enviado com sucesso!",
      });
    } catch (error: any) {
      toast({
        title: "Erro no upload",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingMedia(false);
    }
  };

  const getAcceptedFileTypes = () => {
    switch (newTemplateType) {
      case "image":
        return "image/jpeg,image/png,image/gif,image/webp";
      case "video":
        return "video/mp4,video/webm";
      case "audio":
        return "audio/mpeg,audio/ogg,audio/aac,audio/wav";
      default:
        return "";
    }
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
    <div className="p-6 space-y-6 bg-background min-h-screen animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie seu escritório, equipe e preferências
        </p>
      </div>

      <Tabs defaultValue="classes">
        <TabsList className="grid w-full max-w-4xl grid-cols-7 overflow-x-auto">
          <TabsTrigger value="classes" className="gap-1.5 text-xs sm:text-sm">
            <Layers className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Classes</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5 text-xs sm:text-sm">
            <MessageSquareText className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5 text-xs sm:text-sm">
            <Users className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Membros</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5 text-xs sm:text-sm">
            <Plug className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Integrações</span>
          </TabsTrigger>
          <TabsTrigger value="office" className="gap-1.5 text-xs sm:text-sm">
            <Building2 className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Info.</span>
          </TabsTrigger>
          <TabsTrigger value="myplan" className="gap-1.5 text-xs sm:text-sm">
            <CreditCard className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Plano</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5 text-xs sm:text-sm">
            <Shield className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Segurança</span>
          </TabsTrigger>
        </TabsList>

        {/* Classes Settings - Contains Status, Tags, Departments */}
        <TabsContent value="classes" className="space-y-6 mt-6">
          <ClassesSubTabs 
            statuses={statuses}
            createStatus={createStatus}
            updateStatus={updateStatus}
            deleteStatus={deleteStatus}
            statusDialogOpen={statusDialogOpen}
            setStatusDialogOpen={setStatusDialogOpen}
            newStatusName={newStatusName}
            setNewStatusName={setNewStatusName}
            newStatusColor={newStatusColor}
            setNewStatusColor={setNewStatusColor}
            handleCreateStatus={handleCreateStatus}
            tags={tags}
            createTag={createTag}
            updateTag={updateTag}
            deleteTag={deleteTag}
            tagDialogOpen={tagDialogOpen}
            setTagDialogOpen={setTagDialogOpen}
            newTagName={newTagName}
            setNewTagName={setNewTagName}
            newTagColor={newTagColor}
            setNewTagColor={setNewTagColor}
            handleCreateTag={handleCreateTag}
            departments={departments}
            createDepartment={createDepartment}
            updateDepartment={updateDepartment}
            deleteDepartment={deleteDepartment}
            deptDialogOpen={deptDialogOpen}
            setDeptDialogOpen={setDeptDialogOpen}
            newDeptName={newDeptName}
            setNewDeptName={setNewDeptName}
            newDeptColor={newDeptColor}
            setNewDeptColor={setNewDeptColor}
            handleCreateDepartment={handleCreateDepartment}
            draggedDept={draggedDept}
            handleDeptDragStart={handleDeptDragStart}
            handleDeptDragOver={handleDeptDragOver}
            handleDeptDrop={handleDeptDrop}
          />
        </TabsContent>


        {/* Templates Settings */}
        <TabsContent value="templates" className="space-y-6 mt-6">
          <SettingsHelpCollapsible
            title="Como funcionam os Templates?"
            items={[
              { text: "Templates são mensagens pré-configuradas que podem ser reutilizadas rapidamente." },
              { text: "Use atalhos (como /saudacao) para enviar templates instantaneamente no chat." },
              { text: "Templates suportam texto, imagens, vídeos, áudios e arquivos." },
            ]}
            tip="Crie templates para respostas frequentes e aumente sua produtividade no atendimento."
          />
          
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
                        <div className="space-y-3">
                          <Label>Mídia ({newTemplateType === "image" ? "Imagem" : newTemplateType === "video" ? "Vídeo" : "Áudio"})</Label>
                          
                          {/* Upload from computer */}
                          <div className="flex gap-2">
                            <input
                              type="file"
                              ref={templateMediaInputRef}
                              onChange={handleTemplateMediaUpload}
                              accept={getAcceptedFileTypes()}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => templateMediaInputRef.current?.click()}
                              disabled={uploadingMedia}
                              className="flex-1"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              {uploadingMedia ? "Enviando..." : "Upload do Computador"}
                            </Button>
                          </div>
                          
                          {/* Or paste URL */}
                          <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                              <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                              <span className="bg-background px-2 text-muted-foreground">ou cole uma URL</span>
                            </div>
                          </div>
                          
                          <Input
                            value={newTemplateMediaUrl}
                            onChange={(e) => setNewTemplateMediaUrl(e.target.value)}
                            placeholder={`https://exemplo.com/${newTemplateType === "image" ? "imagem.jpg" : newTemplateType === "video" ? "video.mp4" : "audio.mp3"}`}
                          />
                          
                          {/* Preview */}
                          {newTemplateMediaUrl && (
                            <div className="border rounded-lg p-2 bg-muted/50">
                              {newTemplateType === "image" && (
                                <img src={newTemplateMediaUrl} alt="Preview" className="max-h-32 rounded mx-auto" />
                              )}
                              {newTemplateType === "video" && (
                                <video src={newTemplateMediaUrl} controls className="max-h-32 rounded mx-auto" />
                              )}
                              {newTemplateType === "audio" && (
                                <audio src={newTemplateMediaUrl} controls className="w-full" />
                              )}
                            </div>
                          )}
                          
                          <p className="text-xs text-muted-foreground">
                            {newTemplateType === "image" && "Formatos suportados: JPG, PNG, GIF, WebP"}
                            {newTemplateType === "video" && "Formatos suportados: MP4, WebM"}
                            {newTemplateType === "audio" && "Formatos suportados: MP3, OGG, AAC, WAV"}
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
                  {templates.map((template) => (
                    <EditableTemplate
                      key={template.id}
                      id={template.id}
                      name={template.name}
                      shortcut={template.shortcut}
                      content={template.content}
                      category={template.category || "text"}
                      onUpdate={({ id, name, shortcut, content, category }) => 
                        updateTemplate.mutate({ id, name, shortcut, content, category })
                      }
                      onDelete={(id) => deleteTemplate.mutate(id)}
                      isPending={updateTemplate.isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations Settings */}
        <TabsContent value="integrations" className="space-y-6 mt-6">
          <IntegrationsSettings />
        </TabsContent>


        {/* Office Settings */}
        <TabsContent value="office" className="space-y-6 mt-6">
          <GeneralInfoSettings
            lawFirm={lawFirm as any}
            onSave={async (data) => {
              setSaving(true);
              try {
                await updateLawFirm.mutateAsync(data as any);
              } finally {
                setSaving(false);
              }
            }}
            onLogoUpload={async (file) => {
              await uploadLogo.mutateAsync(file);
            }}
            saving={saving}
            uploadingLogo={uploadLogo.isPending}
          />
        </TabsContent>

        {/* Team Settings */}
        <TabsContent value="team" className="space-y-6 mt-6">
          <SettingsHelpCollapsible
            title="Como funcionam os Membros?"
            items={[
              { text: "Membros são usuários que podem acessar a plataforma, gerenciar agentes e atender leads." },
              { text: "Convide membros para colaborar, compartilhar conhecimento e impulsionar o atendimento da sua equipe!" },
              { text: "Defina cargos e permissões para cada membro, garantindo segurança e organização no seu time." },
            ]}
            tip="Mantenha sua equipe alinhada e pronta para atender melhor seus clientes adicionando novos membros sempre que necessário."
          />
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Membros da Equipe</CardTitle>
                  <CardDescription>
                    Gerencie os usuários e suas permissões
                  </CardDescription>
                </div>
                <Button onClick={() => setInviteDialogOpen(true)}>
                  <Users className="h-4 w-4 mr-2" />
                  Convidar membro
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {teamLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : teamMembers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum membro na equipe</p>
                  <p className="text-sm">Clique em "Convidar membro" para adicionar</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead>Permissões</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.filter(m => m.is_active).map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.full_name}</TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell>
                          <Badge className={roleLabels[member.role]?.color || "bg-muted"}>
                            {roleLabels[member.role]?.label || member.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(member.role === "admin" || member.role === "gerente") && (
                            <span className="text-xs text-muted-foreground">
                              {member.role === "admin" ? "Acesso total" : "Acesso completo"}
                            </span>
                          )}
                          {member.role === "atendente" && (
                            <div className="flex flex-wrap gap-1">
                              {member.can_access_no_department && (
                                <Badge variant="outline" className="text-xs border-muted-foreground/50 text-muted-foreground">
                                  Sem Departamento
                                </Badge>
                              )}
                              {member.can_access_archived && (
                                <Badge variant="outline" className="text-xs border-red-500/50 text-red-500">
                                  Arquivados
                                </Badge>
                              )}
                              {member.department_ids.length > 0 ? (
                                member.department_ids.map(deptId => {
                                  const dept = departments.find(d => d.id === deptId);
                                  return dept ? (
                                    <Badge key={deptId} variant="outline" className="text-xs" style={{ borderColor: dept.color, color: dept.color }}>
                                      {dept.name}
                                    </Badge>
                                  ) : null;
                                })
                              ) : (
                                !member.can_access_no_department && !member.can_access_archived && (
                                  <span className="text-xs text-muted-foreground">Sem permissões</span>
                                )
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setEditingMember(member.id);
                              setEditMemberRole(member.role);
                              // Initialize with real department UUIDs + NO_DEPARTMENT_ID if flag is true
                              const initialDepts = [
                                ...(member.department_ids || []),
                                ...(member.can_access_no_department ? [NO_DEPARTMENT_ID] : []),
                              ];
                              setEditMemberDepts(initialDepts);
                              setEditMemberCanAccessArchived(member.can_access_archived || false);
                            }}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Editar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Dialog de edição de membro - FORA do loop para evitar múltiplos overlays */}
              {(() => {
                const memberBeingEdited = teamMembers.find(m => m.id === editingMember);
                const activeDepartments = departments?.filter(d => {
                  if (!d.is_active) return false;
                  // Exclude only "Arquivados" department - controlled by special permission checkbox
                  const nameLower = d.name.toLowerCase();
                  if (nameLower === 'arquivados' || nameLower === 'arquivado') {
                    return false;
                  }
                  return true;
                }) || [];
                
                return (
                  <Dialog 
                    open={editingMember !== null} 
                    onOpenChange={(open) => {
                      if (!open) setEditingMember(null);
                    }}
                  >
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Editar Permissões - {memberBeingEdited?.full_name}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div className="space-y-2">
                          <Label>Função</Label>
                          <Select 
                            value={editMemberRole} 
                            onValueChange={(v) => setEditMemberRole(v as AppRole)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Administrador - Acesso total ao sistema</SelectItem>
                              <SelectItem value="gerente">Gerente - Acesso completo à operação</SelectItem>
                              <SelectItem value="atendente">Atendente - Apenas departamentos selecionados</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {editMemberRole === "atendente" && (
                          <div className="space-y-2">
                            <Label>Departamentos com acesso</Label>
                            <p className="text-xs text-muted-foreground mb-2">
                              Atendente não pode: modificar configurações, conexões ou automações.
                            </p>
                            <div className="space-y-2 border rounded-lg p-3 max-h-[200px] overflow-y-auto">
                              {/* Special "Sem Departamento" option */}
                              <div 
                                className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-muted/50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const NO_DEPT = "__no_department__";
                                  setEditMemberDepts(prev => 
                                    prev.includes(NO_DEPT) 
                                      ? prev.filter(id => id !== NO_DEPT)
                                      : [...prev, NO_DEPT]
                                  );
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <Checkbox 
                                  checked={editMemberDepts.includes("__no_department__")}
                                  onCheckedChange={(checked) => {
                                    const NO_DEPT = "__no_department__";
                                    if (checked === true) {
                                      if (!editMemberDepts.includes(NO_DEPT)) {
                                        setEditMemberDepts(prev => [...prev, NO_DEPT]);
                                      }
                                    } else {
                                      if (editMemberDepts.includes(NO_DEPT)) {
                                        setEditMemberDepts(prev => prev.filter(id => id !== NO_DEPT));
                                      }
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => e.stopPropagation()}
                                />
                                <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/50" />
                                <span className="text-sm font-medium">Sem Departamento</span>
                              </div>
                              
                              {/* Special "Arquivados/Finalizados" option */}
                              <div 
                                className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-muted/50 border-b pb-2 mb-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditMemberCanAccessArchived(prev => !prev);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <Checkbox 
                                  checked={editMemberCanAccessArchived}
                                  onCheckedChange={(checked) => {
                                    setEditMemberCanAccessArchived(checked === true);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => e.stopPropagation()}
                                />
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                <span className="text-sm font-medium">Arquivados</span>
                              </div>
                              
                              {/* Regular departments */}
                              {activeDepartments.length > 0 ? (
                                activeDepartments.map(dept => (
                                  <div 
                                    key={dept.id} 
                                    className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-muted/50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditMemberDepts(prev => 
                                        prev.includes(dept.id) 
                                          ? prev.filter(id => id !== dept.id)
                                          : [...prev, dept.id]
                                      );
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <Checkbox 
                                      checked={editMemberDepts.includes(dept.id)}
                                      onCheckedChange={(checked) => {
                                        if (checked === true) {
                                          if (!editMemberDepts.includes(dept.id)) {
                                            setEditMemberDepts(prev => [...prev, dept.id]);
                                          }
                                        } else {
                                          if (editMemberDepts.includes(dept.id)) {
                                            setEditMemberDepts(prev => prev.filter(id => id !== dept.id));
                                          }
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      onPointerDown={(e) => e.stopPropagation()}
                                    />
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dept.color }} />
                                    <span className="text-sm">{dept.name}</span>
                                  </div>
                                ))
                              ) : (
                                <p className="text-sm text-muted-foreground text-center py-2">
                                  Nenhum departamento cadastrado
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        <DialogFooter className="pt-4">
                          <Button variant="outline" onClick={() => setEditingMember(null)}>
                            Cancelar
                          </Button>
                          <Button 
                            onClick={async () => {
                              if (!memberBeingEdited) return;
                              setSavingMember(true);
                              try {
                                // Update role if changed
                                if (editMemberRole !== memberBeingEdited.role) {
                                  await updateMemberRole.mutateAsync({ 
                                    memberId: memberBeingEdited.id, 
                                    role: editMemberRole 
                                  });
                                }
                                // Update departments and access flags if atendente
                                if (editMemberRole === "atendente") {
                                  // Split: real UUIDs vs special "no department" flag
                                  const canAccessNoDepartment = editMemberDepts.includes(NO_DEPARTMENT_ID);
                                  const realDepartmentIds = editMemberDepts.filter(id => id !== NO_DEPARTMENT_ID);
                                  
                                  // Update real departments (UUIDs only)
                                  await updateMemberDepartments.mutateAsync({
                                    memberId: memberBeingEdited.id,
                                    departmentIds: realDepartmentIds,
                                  });
                                  
                                  // Update access flags (no-department and archived) together
                                  await updateMemberAccessFlags.mutateAsync({
                                    memberId: memberBeingEdited.id,
                                    canAccessNoDepartment,
                                    canAccessArchived: editMemberCanAccessArchived,
                                  });
                                }
                                setEditingMember(null);
                                toast({
                                  title: "Permissões atualizadas",
                                  description: "As permissões do membro foram salvas.",
                                });
                              } catch (error: any) {
                                toast({
                                  title: "Erro ao salvar",
                                  description: error.message,
                                  variant: "destructive",
                                });
                              } finally {
                                setSavingMember(false);
                              }
                            }}
                            disabled={savingMember}
                          >
                            {savingMember && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Salvar
                          </Button>
                        </DialogFooter>
                      </div>
                    </DialogContent>
                  </Dialog>
                );
              })()}
            </CardContent>
          </Card>
          
          {/* Invite Member Dialog */}
          <InviteMemberDialog
            open={inviteDialogOpen}
            onOpenChange={setInviteDialogOpen}
            onInvite={async (data) => {
              await inviteMember.mutateAsync(data);
            }}
            isLoading={inviteMember.isPending}
          />
        </TabsContent>

        {/* My Plan Settings */}
        <TabsContent value="myplan" className="space-y-6 mt-6">
          <MyPlanSettings />
        </TabsContent>

        {/* Security Settings with Sub-tabs */}
        <TabsContent value="security" className="space-y-6 mt-6">
          <SecuritySubTabs />
        </TabsContent>
      </Tabs>
    </div>
  );
}
