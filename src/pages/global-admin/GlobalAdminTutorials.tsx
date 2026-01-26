import { useState } from "react";
import { useTutorials, useCreateTutorial, useUpdateTutorial, useDeleteTutorial, Tutorial, TutorialInsert } from "@/hooks/useTutorials";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, PlayCircle, Eye, EyeOff, Star, GripVertical, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function TutorialForm({ 
  tutorial, 
  onSubmit, 
  onCancel,
  isLoading 
}: { 
  tutorial?: Tutorial; 
  onSubmit: (data: TutorialInsert) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState<TutorialInsert>({
    title: tutorial?.title || "",
    description: tutorial?.description || "",
    youtube_id: tutorial?.youtube_id || "",
    category: tutorial?.category || "Geral",
    thumbnail_url: tutorial?.thumbnail_url || "",
    duration: tutorial?.duration || "",
    is_active: tutorial?.is_active ?? true,
    is_featured: tutorial?.is_featured ?? false,
    position: tutorial?.position ?? 0,
    context: tutorial?.context || "",
    prerequisites: tutorial?.prerequisites || [],
  });
  
  const [prerequisitesText, setPrerequisitesText] = useState(
    tutorial?.prerequisites?.join("\n") || ""
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      prerequisites: prerequisitesText.split("\n").filter(p => p.trim()),
    });
  };

  // Extract YouTube ID from various URL formats
  const extractYouTubeId = (input: string) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
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
            placeholder="Ex: Como configurar seu primeiro agente"
            required
          />
        </div>
        
        <div>
          <Label htmlFor="youtube_id">Link ou ID do YouTube *</Label>
          <Input
            id="youtube_id"
            value={formData.youtube_id}
            onChange={(e) => setFormData({ ...formData, youtube_id: extractYouTubeId(e.target.value) })}
            placeholder="Cole o link ou ID do vídeo"
            required
          />
          {formData.youtube_id && (
            <p className="text-xs text-muted-foreground mt-1">
              ID: {formData.youtube_id}
            </p>
          )}
        </div>
        
        <div>
          <Label htmlFor="category">Categoria *</Label>
          <Input
            id="category"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            placeholder="Ex: Introdução, Agentes, Conexões"
            required
          />
        </div>
        
        <div>
          <Label htmlFor="duration">Duração</Label>
          <Input
            id="duration"
            value={formData.duration || ""}
            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
            placeholder="Ex: 5:30"
          />
        </div>
        
        <div>
          <Label htmlFor="position">Ordem</Label>
          <Input
            id="position"
            type="number"
            value={formData.position}
            onChange={(e) => setFormData({ ...formData, position: parseInt(e.target.value) || 0 })}
          />
        </div>
        
        <div className="col-span-2">
          <Label htmlFor="description">Descrição curta</Label>
          <Textarea
            id="description"
            value={formData.description || ""}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Breve descrição do conteúdo do tutorial"
            rows={2}
          />
        </div>
        
        <div className="col-span-2">
          <Label htmlFor="context">Contexto (exibido no modal)</Label>
          <Textarea
            id="context"
            value={formData.context || ""}
            onChange={(e) => setFormData({ ...formData, context: e.target.value })}
            placeholder="Contexto detalhado sobre o vídeo"
            rows={3}
          />
        </div>
        
        <div className="col-span-2">
          <Label htmlFor="prerequisites">Pré-requisitos (um por linha)</Label>
          <Textarea
            id="prerequisites"
            value={prerequisitesText}
            onChange={(e) => setPrerequisitesText(e.target.value)}
            placeholder="Conhecimento básico de informática&#10;Ter uma conta ativa"
            rows={3}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Switch
            id="is_active"
            checked={formData.is_active}
            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
          />
          <Label htmlFor="is_active">Ativo (visível para clientes)</Label>
        </div>
        
        <div className="flex items-center gap-2">
          <Switch
            id="is_featured"
            checked={formData.is_featured}
            onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
          />
          <Label htmlFor="is_featured">Destaque</Label>
        </div>
      </div>

      <DialogFooter className="gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Salvando..." : tutorial ? "Atualizar" : "Criar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function GlobalAdminTutorials() {
  const { data: tutorials, isLoading } = useTutorials(false);
  const createTutorial = useCreateTutorial();
  const updateTutorial = useUpdateTutorial();
  const deleteTutorial = useDeleteTutorial();
  
  const [editingTutorial, setEditingTutorial] = useState<Tutorial | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const handleCreate = (data: TutorialInsert) => {
    createTutorial.mutate(data, {
      onSuccess: () => setIsCreateOpen(false),
    });
  };

  const handleUpdate = (data: TutorialInsert) => {
    if (!editingTutorial) return;
    updateTutorial.mutate({ id: editingTutorial.id, ...data }, {
      onSuccess: () => {
        setIsEditOpen(false);
        setEditingTutorial(null);
      },
    });
  };

  const handleToggleActive = (tutorial: Tutorial) => {
    updateTutorial.mutate({ id: tutorial.id, is_active: !tutorial.is_active });
  };

  const handleToggleFeatured = (tutorial: Tutorial) => {
    updateTutorial.mutate({ id: tutorial.id, is_featured: !tutorial.is_featured });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gerenciar Tutoriais</h1>
          <p className="text-muted-foreground">
            Adicione e gerencie os vídeos tutoriais exibidos para os clientes
          </p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Tutorial
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Tutorial</DialogTitle>
            </DialogHeader>
            <TutorialForm 
              onSubmit={handleCreate} 
              onCancel={() => setIsCreateOpen(false)}
              isLoading={createTutorial.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5" />
            Tutoriais ({tutorials?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : tutorials?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <PlayCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum tutorial cadastrado</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setIsCreateOpen(true)}
              >
                Criar primeiro tutorial
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tutorials?.map((tutorial) => (
                  <TableRow key={tutorial.id}>
                    <TableCell className="font-mono text-muted-foreground">
                      {tutorial.position}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://img.youtube.com/vi/${tutorial.youtube_id}/mqdefault.jpg`}
                          alt=""
                          className="w-16 h-9 object-cover rounded"
                        />
                        <div>
                          <p className="font-medium line-clamp-1">{tutorial.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {tutorial.description}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{tutorial.category}</Badge>
                    </TableCell>
                    <TableCell>{tutorial.duration || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleToggleActive(tutorial)}
                          title={tutorial.is_active ? "Desativar" : "Ativar"}
                        >
                          {tutorial.is_active ? (
                            <Eye className="h-4 w-4 text-green-500" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleToggleFeatured(tutorial)}
                          title={tutorial.is_featured ? "Remover destaque" : "Destacar"}
                        >
                          <Star className={`h-4 w-4 ${tutorial.is_featured ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"}`} />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => window.open(`https://youtube.com/watch?v=${tutorial.youtube_id}`, "_blank")}
                          title="Ver no YouTube"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Dialog open={isEditOpen && editingTutorial?.id === tutorial.id} onOpenChange={(open) => {
                          setIsEditOpen(open);
                          if (!open) setEditingTutorial(null);
                        }}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingTutorial(tutorial);
                                setIsEditOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Editar Tutorial</DialogTitle>
                            </DialogHeader>
                            {editingTutorial && (
                              <TutorialForm 
                                tutorial={editingTutorial}
                                onSubmit={handleUpdate} 
                                onCancel={() => {
                                  setIsEditOpen(false);
                                  setEditingTutorial(null);
                                }}
                                isLoading={updateTutorial.isPending}
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
                              <AlertDialogTitle>Excluir tutorial?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. O tutorial "{tutorial.title}" será removido permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteTutorial.mutate(tutorial.id)}
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
