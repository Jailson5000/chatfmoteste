import { useState } from "react";
import { Plus, Pencil, Trash2, Loader2, User, Phone, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAgendaProProfessionals, AgendaProProfessional } from "@/hooks/useAgendaProProfessionals";
import { useAgendaProServices } from "@/hooks/useAgendaProServices";
import { Checkbox } from "@/components/ui/checkbox";

interface ProfessionalFormData {
  name: string;
  email: string;
  phone: string;
  specialty: string;
  bio: string;
  color: string;
  service_ids: string[];
}

const defaultFormData: ProfessionalFormData = {
  name: "",
  email: "",
  phone: "",
  specialty: "",
  bio: "",
  color: "#6366f1",
  service_ids: [],
};

export function AgendaProProfessionals() {
  const { professionals, isLoading, createProfessional, updateProfessional, deleteProfessional } = useAgendaProProfessionals();
  const { activeServices } = useAgendaProServices();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<AgendaProProfessional | null>(null);
  const [deletingProfessional, setDeletingProfessional] = useState<AgendaProProfessional | null>(null);
  const [formData, setFormData] = useState<ProfessionalFormData>(defaultFormData);

  const handleOpenNew = () => {
    setEditingProfessional(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  };

  const handleEdit = (prof: AgendaProProfessional) => {
    setEditingProfessional(prof);
    setFormData({
      name: prof.name,
      email: prof.email || "",
      phone: prof.phone || "",
      specialty: prof.specialty || "",
      bio: prof.bio || "",
      color: prof.color,
      service_ids: prof.services?.map((s) => s.id) || [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const data = {
      name: formData.name,
      email: formData.email || null,
      phone: formData.phone || null,
      specialty: formData.specialty || null,
      bio: formData.bio || null,
      color: formData.color,
      service_ids: formData.service_ids,
    };

    if (editingProfessional) {
      await updateProfessional.mutateAsync({ id: editingProfessional.id, ...data });
    } else {
      await createProfessional.mutateAsync(data);
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (deletingProfessional) {
      deleteProfessional.mutate(deletingProfessional.id);
      setDeleteDialogOpen(false);
      setDeletingProfessional(null);
    }
  };

  const toggleService = (serviceId: string) => {
    setFormData((prev) => ({
      ...prev,
      service_ids: prev.service_ids.includes(serviceId)
        ? prev.service_ids.filter((id) => id !== serviceId)
        : [...prev.service_ids, serviceId],
    }));
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
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
        <h2 className="text-lg font-semibold">Profissionais</h2>
        <Button onClick={handleOpenNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Profissional
        </Button>
      </div>

      {professionals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
            <User className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium">Nenhum profissional cadastrado</h3>
            <p className="text-sm text-muted-foreground mb-4">Comece adicionando seu primeiro profissional</p>
            <Button onClick={handleOpenNew}>Adicionar Profissional</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {professionals.map((prof) => (
            <Card key={prof.id} className={!prof.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10" style={{ backgroundColor: prof.color }}>
                      <AvatarFallback className="text-white text-sm">
                        {getInitials(prof.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">{prof.name}</CardTitle>
                      {prof.specialty && (
                        <p className="text-xs text-muted-foreground">{prof.specialty}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(prof)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setDeletingProfessional(prof);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1 text-sm">
                  {prof.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      {prof.phone}
                    </div>
                  )}
                  {prof.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate">{prof.email}</span>
                    </div>
                  )}
                </div>
                {prof.services && prof.services.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {prof.services.slice(0, 3).map((service) => (
                      <Badge key={service.id} variant="secondary" className="text-xs">
                        {service.name}
                      </Badge>
                    ))}
                    {prof.services.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{prof.services.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    {prof.is_active ? "Ativo" : "Inativo"}
                  </span>
                  <Switch
                    checked={prof.is_active}
                    onCheckedChange={(checked) =>
                      updateProfessional.mutate({ id: prof.id, is_active: checked })
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
            <DialogTitle>{editingProfessional ? "Editar Profissional" : "Novo Profissional"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nome completo"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="specialty">Especialidade</Label>
              <Input
                id="specialty"
                value={formData.specialty}
                onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                placeholder="Ex: Psicóloga, Advogado..."
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
                  placeholder="#6366f1"
                  className="flex-1"
                />
              </div>
            </div>
            {activeServices.length > 0 && (
              <div className="grid gap-2">
                <Label>Serviços que realiza</Label>
                <div className="border rounded-lg p-3 max-h-[150px] overflow-y-auto space-y-2">
                  {activeServices.map((service) => (
                    <div key={service.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`service-${service.id}`}
                        checked={formData.service_ids.includes(service.id)}
                        onCheckedChange={() => toggleService(service.id)}
                      />
                      <label htmlFor={`service-${service.id}`} className="text-sm cursor-pointer flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: service.color }} />
                        {service.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="bio">Biografia</Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Uma breve descrição..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.name || createProfessional.isPending || updateProfessional.isPending}>
              {(createProfessional.isPending || updateProfessional.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingProfessional ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Profissional</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover "{deletingProfessional?.name}"? Esta ação não pode ser desfeita.
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
