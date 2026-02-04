import { useState } from "react";
import {
  useOnboardingStepsAdmin,
  useOnboardingMeetingUrl,
  useCreateOnboardingStep,
  useUpdateOnboardingStep,
  useDeleteOnboardingStep,
  useUpdateMeetingUrl,
  OnboardingStep,
  OnboardingStepInsert,
} from "@/hooks/useOnboardingAdmin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Pencil,
  Trash2,
  Rocket,
  Eye,
  EyeOff,
  ExternalLink,
  Video,
  Calendar,
  Save,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function OnboardingStepForm({
  step,
  onSubmit,
  onCancel,
  isLoading,
}: {
  step?: OnboardingStep;
  onSubmit: (data: OnboardingStepInsert) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState<OnboardingStepInsert>({
    title: step?.title || "",
    description: step?.description || "",
    youtube_id: step?.youtube_id || "",
    action_label: step?.action_label || "",
    action_route: step?.action_route || "",
    position: step?.position ?? 1,
    is_active: step?.is_active ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  // Extract YouTube ID from various URL formats
  const extractYouTubeId = (input: string) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) return match[1];
    }
    return input;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="title">Título *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Ex: Dados do Escritório"
            required
            minLength={3}
          />
        </div>

        <div className="col-span-2">
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            value={formData.description || ""}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Breve descrição da etapa"
            rows={2}
          />
        </div>

        <div>
          <Label htmlFor="youtube_id">Link ou ID do YouTube</Label>
          <Input
            id="youtube_id"
            value={formData.youtube_id || ""}
            onChange={(e) =>
              setFormData({ ...formData, youtube_id: extractYouTubeId(e.target.value) })
            }
            placeholder="Cole o link ou ID do vídeo"
          />
          {formData.youtube_id && (
            <p className="text-xs text-muted-foreground mt-1">ID: {formData.youtube_id}</p>
          )}
        </div>

        <div>
          <Label htmlFor="position">Ordem/Posição *</Label>
          <Input
            id="position"
            type="number"
            min={1}
            value={formData.position}
            onChange={(e) =>
              setFormData({ ...formData, position: parseInt(e.target.value) || 1 })
            }
            required
          />
        </div>

        <div>
          <Label htmlFor="action_label">Label do Botão</Label>
          <Input
            id="action_label"
            value={formData.action_label || ""}
            onChange={(e) => setFormData({ ...formData, action_label: e.target.value })}
            placeholder="Ex: Preencher Dados"
          />
        </div>

        <div>
          <Label htmlFor="action_route">Rota da Ação</Label>
          <Input
            id="action_route"
            value={formData.action_route || ""}
            onChange={(e) => setFormData({ ...formData, action_route: e.target.value })}
            placeholder="Ex: /settings"
          />
          {formData.action_route && !formData.action_route.startsWith("/") && (
            <p className="text-xs text-destructive mt-1">A rota deve começar com "/"</p>
          )}
        </div>

        <div className="col-span-2 flex items-center gap-2">
          <Switch
            id="is_active"
            checked={formData.is_active}
            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
          />
          <Label htmlFor="is_active">Ativo (visível para clientes)</Label>
        </div>
      </div>

      <DialogFooter className="gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </DialogClose>
        <Button
          type="submit"
          disabled={isLoading || (formData.action_route && !formData.action_route.startsWith("/"))}
        >
          {isLoading ? "Salvando..." : step ? "Atualizar" : "Criar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function GlobalAdminOnboarding() {
  const { data: steps, isLoading } = useOnboardingStepsAdmin();
  const { data: meetingUrl, isLoading: isLoadingUrl } = useOnboardingMeetingUrl();
  const createStep = useCreateOnboardingStep();
  const updateStep = useUpdateOnboardingStep();
  const deleteStep = useDeleteOnboardingStep();
  const updateMeetingUrl = useUpdateMeetingUrl();

  const [editingStep, setEditingStep] = useState<OnboardingStep | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [localMeetingUrl, setLocalMeetingUrl] = useState("");

  // Initialize local meeting URL when data loads
  useState(() => {
    if (meetingUrl !== undefined) {
      setLocalMeetingUrl(meetingUrl);
    }
  });

  const handleCreate = (data: OnboardingStepInsert) => {
    createStep.mutate(data, {
      onSuccess: () => setIsCreateOpen(false),
    });
  };

  const handleUpdate = (data: OnboardingStepInsert) => {
    if (!editingStep) return;
    updateStep.mutate(
      { id: editingStep.id, ...data },
      {
        onSuccess: () => {
          setIsEditOpen(false);
          setEditingStep(null);
        },
      }
    );
  };

  const handleToggleActive = (step: OnboardingStep) => {
    updateStep.mutate({ id: step.id, is_active: !step.is_active });
  };

  const handleSaveMeetingUrl = () => {
    updateMeetingUrl.mutate(localMeetingUrl);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gerenciar Onboarding</h1>
          <p className="text-muted-foreground">
            Configure as etapas do guia de primeiros passos exibido para os clientes
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Etapa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Nova Etapa</DialogTitle>
            </DialogHeader>
            <OnboardingStepForm
              onSubmit={handleCreate}
              onCancel={() => setIsCreateOpen(false)}
              isLoading={createStep.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* URL de Agendamento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            URL de Agendamento
          </CardTitle>
          <CardDescription>
            Link para agendamento de reunião de onboarding (Calendly, Google Calendar, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {isLoadingUrl ? (
              <Skeleton className="h-10 flex-1" />
            ) : (
              <Input
                value={localMeetingUrl || (typeof meetingUrl === "string" ? meetingUrl : "") || ""}
                onChange={(e) => setLocalMeetingUrl(e.target.value)}
                placeholder="https://calendly.com/seu-link"
                className="flex-1"
              />
            )}
            <Button
              onClick={handleSaveMeetingUrl}
              disabled={updateMeetingUrl.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateMeetingUrl.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Etapas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Etapas do Onboarding ({steps?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : steps?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Rocket className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma etapa cadastrada</p>
              <Button variant="outline" className="mt-4" onClick={() => setIsCreateOpen(true)}>
                Criar primeira etapa
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead className="text-center">Vídeo</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {steps?.map((step) => (
                  <TableRow key={step.id}>
                    <TableCell className="font-mono text-muted-foreground">
                      {step.position}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{step.title}</p>
                        {step.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {step.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {step.action_route || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {step.youtube_id ? (
                        <Video className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleToggleActive(step)}
                          title={step.is_active ? "Desativar" : "Ativar"}
                        >
                          {step.is_active ? (
                            <Eye className="h-4 w-4 text-green-500" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {step.youtube_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              window.open(
                                `https://youtube.com/watch?v=${step.youtube_id}`,
                                "_blank"
                              )
                            }
                            title="Ver no YouTube"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        <Dialog
                          open={isEditOpen && editingStep?.id === step.id}
                          onOpenChange={(open) => {
                            setIsEditOpen(open);
                            if (!open) setEditingStep(null);
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingStep(step);
                                setIsEditOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Editar Etapa</DialogTitle>
                            </DialogHeader>
                            {editingStep && (
                              <OnboardingStepForm
                                step={editingStep}
                                onSubmit={handleUpdate}
                                onCancel={() => {
                                  setIsEditOpen(false);
                                  setEditingStep(null);
                                }}
                                isLoading={updateStep.isPending}
                              />
                            )}
                          </DialogContent>
                        </Dialog>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir etapa?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. A etapa "{step.title}" será
                                removida permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteStep.mutate(step.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
