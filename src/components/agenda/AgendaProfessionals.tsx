import { useState } from "react";
import { Plus, Pencil, Trash2, User, Phone, Mail, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useProfessionals, Professional } from "@/hooks/useProfessionals";
import { useServices } from "@/hooks/useServices";
import { formatPhone } from "@/lib/inputMasks";
import { cn } from "@/lib/utils";

interface ProfessionalFormData {
  name: string;
  email: string;
  phone: string;
  document: string;
  specialty: string;
  notes: string;
  serviceIds: string[];
}

const defaultFormData: ProfessionalFormData = {
  name: "",
  email: "",
  phone: "",
  document: "",
  specialty: "",
  notes: "",
  serviceIds: [],
};

export function AgendaProfessionals() {
  const { professionals, isLoading, createProfessional, updateProfessional, deleteProfessional } = useProfessionals();
  const { services } = useServices();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const [deletingProfessional, setDeletingProfessional] = useState<Professional | null>(null);
  const [formData, setFormData] = useState<ProfessionalFormData>(defaultFormData);

  const handleOpenNew = () => {
    setEditingProfessional(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  };

  const handleEdit = (professional: Professional) => {
    setEditingProfessional(professional);
    setFormData({
      name: professional.name,
      email: professional.email || "",
      phone: professional.phone || "",
      document: professional.document || "",
      specialty: professional.specialty || "",
      notes: professional.notes || "",
      serviceIds: professional.services?.map((s) => s.id) || [],
    });
    setDialogOpen(true);
  };

  const handleDelete = (professional: Professional) => {
    setDeletingProfessional(professional);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deletingProfessional) {
      await deleteProfessional.mutateAsync(deletingProfessional.id);
      setDeleteDialogOpen(false);
      setDeletingProfessional(null);
    }
  };

  const handleSubmit = async () => {
    const data = {
      name: formData.name,
      email: formData.email || null,
      phone: formData.phone || null,
      document: formData.document || null,
      specialty: formData.specialty || null,
      notes: formData.notes || null,
      serviceIds: formData.serviceIds,
    };

    if (editingProfessional) {
      await updateProfessional.mutateAsync({ id: editingProfessional.id, ...data });
    } else {
      await createProfessional.mutateAsync(data);
    }

    setDialogOpen(false);
    setEditingProfessional(null);
    setFormData(defaultFormData);
  };

  const handleToggleActive = async (professional: Professional) => {
    await updateProfessional.mutateAsync({
      id: professional.id,
      is_active: !professional.is_active,
    });
  };

  const toggleService = (serviceId: string) => {
    setFormData((prev) => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(serviceId)
        ? prev.serviceIds.filter((id) => id !== serviceId)
        : [...prev.serviceIds, serviceId],
    }));
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
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
          <h2 className="text-xl font-semibold">Profissionais</h2>
          <p className="text-sm text-muted-foreground">
            Cadastre os profissionais que realizam os serviços
          </p>
        </div>
        <Button onClick={handleOpenNew}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Profissional
        </Button>
      </div>

      {professionals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum profissional cadastrado</h3>
            <p className="text-muted-foreground text-center mb-4">
              Cadastre profissionais para vincular aos serviços
            </p>
            <Button onClick={handleOpenNew}>
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar Profissional
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {professionals.map((professional) => (
            <Card
              key={professional.id}
              className={cn(
                "relative transition-opacity",
                !professional.is_active && "opacity-60"
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(professional.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">{professional.name}</CardTitle>
                      {professional.specialty && (
                        <CardDescription className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {professional.specialty}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={professional.is_active}
                    onCheckedChange={() => handleToggleActive(professional)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground mb-4">
                  {professional.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{formatPhone(professional.phone)}</span>
                    </div>
                  )}
                  {professional.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate">{professional.email}</span>
                    </div>
                  )}
                </div>

                {professional.services && professional.services.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {professional.services.map((service) => (
                      <Badge
                        key={service.id}
                        variant="outline"
                        className="text-xs"
                        style={{ borderColor: service.color, color: service.color }}
                      >
                        {service.name}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(professional)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(professional)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Professional Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProfessional ? "Editar Profissional" : "Novo Profissional"}
            </DialogTitle>
            <DialogDescription>
              Preencha as informações do profissional
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nome completo"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={formatPhone(formData.phone)}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, "") })}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-2">
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="document">CPF/CNPJ</Label>
                <Input
                  id="document"
                  value={formData.document}
                  onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialty">Especialidade</Label>
                <Input
                  id="specialty"
                  value={formData.specialty}
                  onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  placeholder="Ex: Esteticista"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Anotações sobre o profissional..."
                rows={2}
              />
            </div>

            {services.length > 0 && (
              <div className="space-y-2">
                <Label>Serviços que realiza</Label>
                <div className="border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                  {services.map((service) => (
                    <div key={service.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`service-${service.id}`}
                        checked={formData.serviceIds.includes(service.id)}
                        onCheckedChange={() => toggleService(service.id)}
                      />
                      <label
                        htmlFor={`service-${service.id}`}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: service.color }}
                        />
                        {service.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name || createProfessional.isPending || updateProfessional.isPending}
            >
              {editingProfessional ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir profissional?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O profissional "{deletingProfessional?.name}" será removido
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
