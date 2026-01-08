import { useState } from "react";
import { Plus, Pencil, Trash2, Clock, DollarSign, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useServices, Service } from "@/hooks/useServices";
import { cn } from "@/lib/utils";

const COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#ef4444", "#f97316",
  "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1",
];

interface ServiceFormData {
  name: string;
  description: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  price: string;
  color: string;
}

const defaultFormData: ServiceFormData = {
  name: "",
  description: "",
  duration_minutes: 30,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  price: "",
  color: "#6366f1",
};

export function AgendaServices() {
  const { services, isLoading, createService, updateService, deleteService } = useServices();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deletingService, setDeletingService] = useState<Service | null>(null);
  const [formData, setFormData] = useState<ServiceFormData>(defaultFormData);

  const handleOpenNew = () => {
    setEditingService(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || "",
      duration_minutes: service.duration_minutes,
      buffer_before_minutes: service.buffer_before_minutes,
      buffer_after_minutes: service.buffer_after_minutes,
      price: service.price?.toString() || "",
      color: service.color,
    });
    setDialogOpen(true);
  };

  const handleDelete = (service: Service) => {
    setDeletingService(service);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deletingService) {
      await deleteService.mutateAsync(deletingService.id);
      setDeleteDialogOpen(false);
      setDeletingService(null);
    }
  };

  const handleSubmit = async () => {
    const data = {
      name: formData.name,
      description: formData.description || null,
      duration_minutes: formData.duration_minutes,
      buffer_before_minutes: formData.buffer_before_minutes,
      buffer_after_minutes: formData.buffer_after_minutes,
      price: formData.price ? parseFloat(formData.price) : null,
      color: formData.color,
    };

    if (editingService) {
      await updateService.mutateAsync({ id: editingService.id, ...data });
    } else {
      await createService.mutateAsync(data);
    }

    setDialogOpen(false);
    setEditingService(null);
    setFormData(defaultFormData);
  };

  const handleToggleActive = async (service: Service) => {
    await updateService.mutateAsync({
      id: service.id,
      is_active: !service.is_active,
    });
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Serviços</h2>
          <p className="text-sm text-muted-foreground">
            Configure os serviços oferecidos e suas durações
          </p>
        </div>
        <Button onClick={handleOpenNew}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Serviço
        </Button>
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum serviço cadastrado</h3>
            <p className="text-muted-foreground text-center mb-4">
              Crie seus serviços para começar a receber agendamentos
            </p>
            <Button onClick={handleOpenNew}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Serviço
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <Card
              key={service.id}
              className={cn(
                "relative transition-opacity",
                !service.is_active && "opacity-60"
              )}
            >
              <div
                className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
                style={{ backgroundColor: service.color }}
              />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: service.color }}
                    />
                    <CardTitle className="text-base">{service.name}</CardTitle>
                  </div>
                  <Switch
                    checked={service.is_active}
                    onCheckedChange={() => handleToggleActive(service)}
                  />
                </div>
                {service.description && (
                  <CardDescription className="line-clamp-2">
                    {service.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>{formatDuration(service.duration_minutes)}</span>
                  </div>
                  {service.price && (
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4" />
                      <span>R$ {service.price.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {(service.buffer_before_minutes > 0 || service.buffer_after_minutes > 0) && (
                  <div className="flex gap-2 mb-4">
                    {service.buffer_before_minutes > 0 && (
                      <Badge variant="outline" className="text-xs">
                        +{service.buffer_before_minutes}min antes
                      </Badge>
                    )}
                    {service.buffer_after_minutes > 0 && (
                      <Badge variant="outline" className="text-xs">
                        +{service.buffer_after_minutes}min depois
                      </Badge>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(service)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(service)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Service Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingService ? "Editar Serviço" : "Novo Serviço"}
            </DialogTitle>
            <DialogDescription>
              Configure as informações do serviço
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Serviço *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Consulta inicial"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descreva o serviço..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration">Duração (minutos) *</Label>
                <Input
                  id="duration"
                  type="number"
                  min={5}
                  step={5}
                  value={formData.duration_minutes}
                  onChange={(e) =>
                    setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 30 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Preço (R$)</Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="buffer_before">Buffer antes (min)</Label>
                <Input
                  id="buffer_before"
                  type="number"
                  min={0}
                  step={5}
                  value={formData.buffer_before_minutes}
                  onChange={(e) =>
                    setFormData({ ...formData, buffer_before_minutes: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="buffer_after">Buffer depois (min)</Label>
                <Input
                  id="buffer_after"
                  type="number"
                  min={0}
                  step={5}
                  value={formData.buffer_after_minutes}
                  onChange={(e) =>
                    setFormData({ ...formData, buffer_after_minutes: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      "w-6 h-6 rounded-full transition-transform hover:scale-110",
                      formData.color === color && "ring-2 ring-offset-2 ring-primary"
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData({ ...formData, color })}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name || createService.isPending || updateService.isPending}
            >
              {editingService ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O serviço "{deletingService?.name}" será removido
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
