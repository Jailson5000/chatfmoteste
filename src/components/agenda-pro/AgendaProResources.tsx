import { useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Building2, Armchair, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAgendaProResources, AgendaProResource } from "@/hooks/useAgendaProResources";

interface ResourceFormData {
  name: string;
  description: string;
  type: string;
  capacity: number;
  color: string;
}

const defaultFormData: ResourceFormData = {
  name: "",
  description: "",
  type: "room",
  capacity: 1,
  color: "#10b981",
};

const RESOURCE_TYPES = [
  { value: "room", label: "Sala", icon: Building2 },
  { value: "equipment", label: "Equipamento", icon: Monitor },
  { value: "furniture", label: "Mobiliário", icon: Armchair },
];

export function AgendaProResources() {
  const { resources, isLoading, createResource, updateResource, deleteResource } = useAgendaProResources();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<AgendaProResource | null>(null);
  const [deletingResource, setDeletingResource] = useState<AgendaProResource | null>(null);
  const [formData, setFormData] = useState<ResourceFormData>(defaultFormData);

  const handleOpenNew = () => {
    setEditingResource(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  };

  const handleEdit = (resource: AgendaProResource) => {
    setEditingResource(resource);
    setFormData({
      name: resource.name,
      description: resource.description || "",
      type: resource.type,
      capacity: resource.capacity,
      color: resource.color,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const data = {
      name: formData.name,
      description: formData.description || null,
      type: formData.type,
      capacity: formData.capacity,
      color: formData.color,
    };

    if (editingResource) {
      await updateResource.mutateAsync({ id: editingResource.id, ...data });
    } else {
      await createResource.mutateAsync(data);
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (deletingResource) {
      deleteResource.mutate(deletingResource.id);
      setDeleteDialogOpen(false);
      setDeletingResource(null);
    }
  };

  const getTypeConfig = (type: string) => {
    return RESOURCE_TYPES.find((t) => t.value === type) || RESOURCE_TYPES[0];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Salas e Recursos</h2>
        <Button onClick={handleOpenNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Recurso
        </Button>
      </div>

      {resources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium">Nenhum recurso cadastrado</h3>
            <p className="text-sm text-muted-foreground mb-4">Cadastre salas, equipamentos ou outros recursos</p>
            <Button onClick={handleOpenNew}>Adicionar Recurso</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {resources.map((resource) => {
            const typeConfig = getTypeConfig(resource.type);
            const TypeIcon = typeConfig.icon;
            return (
              <Card key={resource.id} className={!resource.is_active ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                        style={{ backgroundColor: resource.color }}
                      >
                        <TypeIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{resource.name}</CardTitle>
                        <Badge variant="secondary" className="text-xs mt-1">
                          {typeConfig.label}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(resource)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDeletingResource(resource);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {resource.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{resource.description}</p>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Capacidade: {resource.capacity}</span>
                    <Switch
                      checked={resource.is_active}
                      onCheckedChange={(checked) =>
                        updateResource.mutate({ id: resource.id, is_active: checked })
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingResource ? "Editar Recurso" : "Novo Recurso"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Sala de Reunião 01"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type">Tipo</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="capacity">Capacidade</Label>
                <Input
                  id="capacity"
                  type="number"
                  min={1}
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="color">Cor</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-12 h-10 p-1"
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição do recurso..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.name || createResource.isPending || updateResource.isPending}>
              {(createResource.isPending || updateResource.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingResource ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Recurso</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover "{deletingResource?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
