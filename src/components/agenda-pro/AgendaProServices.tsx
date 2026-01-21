import { useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Clock, DollarSign, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAgendaProServices, AgendaProService } from "@/hooks/useAgendaProServices";
import { useAgendaProProfessionals } from "@/hooks/useAgendaProProfessionals";
import { Checkbox } from "@/components/ui/checkbox";

interface ServiceFormData {
  name: string;
  description: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  price: string;
  color: string;
  is_public: boolean;
  professional_ids: string[];
}

const defaultFormData: ServiceFormData = {
  name: "",
  description: "",
  duration_minutes: 30,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  price: "",
  color: "#6366f1",
  is_public: true,
  professional_ids: [],
};

export function AgendaProServices() {
  const { services, isLoading, createService, updateService, deleteService } = useAgendaProServices();
  const { activeProfessionals } = useAgendaProProfessionals();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<AgendaProService | null>(null);
  const [deletingService, setDeletingService] = useState<AgendaProService | null>(null);
  const [formData, setFormData] = useState<ServiceFormData>(defaultFormData);

  const handleOpenNew = () => {
    setEditingService(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  };

  const handleEdit = (service: AgendaProService) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || "",
      duration_minutes: service.duration_minutes,
      buffer_before_minutes: service.buffer_before_minutes,
      buffer_after_minutes: service.buffer_after_minutes,
      price: service.price?.toString() || "",
      color: service.color,
      is_public: service.is_public,
      professional_ids: service.professionals?.map((p) => p.id) || [],
    });
    setDialogOpen(true);
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
      is_public: formData.is_public,
      professional_ids: formData.professional_ids,
    };

    if (editingService) {
      await updateService.mutateAsync({ id: editingService.id, ...data });
    } else {
      await createService.mutateAsync(data);
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (deletingService) {
      deleteService.mutate(deletingService.id);
      setDeleteDialogOpen(false);
      setDeletingService(null);
    }
  };

  const toggleProfessional = (profId: string) => {
    setFormData((prev) => ({
      ...prev,
      professional_ids: prev.professional_ids.includes(profId)
        ? prev.professional_ids.filter((id) => id !== profId)
        : [...prev.professional_ids, profId],
    }));
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
        <h2 className="text-lg font-semibold">Serviços</h2>
        <Button onClick={handleOpenNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Serviço
        </Button>
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium">Nenhum serviço cadastrado</h3>
            <p className="text-sm text-muted-foreground mb-4">Comece adicionando seu primeiro serviço</p>
            <Button onClick={handleOpenNew}>Adicionar Serviço</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((service) => (
            <Card key={service.id} className={!service.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: service.color }}
                    />
                    <div>
                      <CardTitle className="text-base">{service.name}</CardTitle>
                      {service.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {service.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(service)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setDeletingService(service);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {service.duration_minutes} min
                  </div>
                  {service.price && (
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      R$ {service.price.toFixed(2)}
                    </div>
                  )}
                </div>
                {service.professionals && service.professionals.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {service.professionals.slice(0, 3).map((prof) => (
                      <Badge key={prof.id} variant="secondary" className="text-xs">
                        {prof.name}
                      </Badge>
                    ))}
                    {service.professionals.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{service.professionals.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    {service.is_public ? "Público" : "Privado"}
                  </span>
                  <Switch
                    checked={service.is_active}
                    onCheckedChange={(checked) =>
                      updateService.mutate({ id: service.id, is_active: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingService ? "Editar Serviço" : "Novo Serviço"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Consulta Inicial"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição do serviço..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="duration">Duração (min)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 30 })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="price">Preço (R$)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
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
                  placeholder="#6366f1"
                  className="flex-1"
                />
              </div>
            </div>
            {activeProfessionals.length > 0 && (
              <div className="grid gap-2">
                <Label>Profissionais</Label>
                <div className="border rounded-lg p-3 max-h-[150px] overflow-y-auto space-y-2">
                  {activeProfessionals.map((prof) => (
                    <div key={prof.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`prof-${prof.id}`}
                        checked={formData.professional_ids.includes(prof.id)}
                        onCheckedChange={() => toggleProfessional(prof.id)}
                      />
                      <label htmlFor={`prof-${prof.id}`} className="text-sm cursor-pointer">
                        {prof.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_public}
                onCheckedChange={(checked) => setFormData({ ...formData, is_public: checked })}
              />
              <Label>Disponível para agendamento online</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.name || createService.isPending || updateService.isPending}>
              {(createService.isPending || updateService.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingService ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Serviço</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o serviço "{deletingService?.name}"? Esta ação não pode ser desfeita.
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
