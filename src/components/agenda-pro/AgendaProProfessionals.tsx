import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Loader2, User, Phone, Mail, AlertTriangle } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAgendaProProfessionals, AgendaProProfessional, DeleteAction } from "@/hooks/useAgendaProProfessionals";
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
  const { 
    professionals, 
    isLoading, 
    createProfessional, 
    updateProfessional, 
    deleteProfessionalWithOptions,
    getAppointmentCount 
  } = useAgendaProProfessionals();
  const { activeServices } = useAgendaProServices();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<AgendaProProfessional | null>(null);
  const [deletingProfessional, setDeletingProfessional] = useState<AgendaProProfessional | null>(null);
  const [formData, setFormData] = useState<ProfessionalFormData>(defaultFormData);
  
  // Delete options state
  const [deleteOption, setDeleteOption] = useState<DeleteAction>('transfer');
  const [transferToId, setTransferToId] = useState<string>('');
  const [appointmentCount, setAppointmentCount] = useState(0);
  const [loadingCount, setLoadingCount] = useState(false);

  // Get other professionals for transfer option
  const otherProfessionals = professionals.filter(
    p => p.id !== deletingProfessional?.id && p.is_active
  );

  // Load appointment count when delete dialog opens
  useEffect(() => {
    if (deleteDialogOpen && deletingProfessional) {
      setLoadingCount(true);
      getAppointmentCount(deletingProfessional.id)
        .then(count => {
          setAppointmentCount(count);
          // Default to delete_all if no other professionals available
          if (otherProfessionals.length === 0 && count > 0) {
            setDeleteOption('delete_all');
          }
        })
        .finally(() => setLoadingCount(false));
    } else {
      setAppointmentCount(0);
      setDeleteOption('transfer');
      setTransferToId('');
    }
  }, [deleteDialogOpen, deletingProfessional]);

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

  const handleDeleteWithOptions = async () => {
    if (!deletingProfessional) return;
    
    await deleteProfessionalWithOptions.mutateAsync({
      id: deletingProfessional.id,
      action: deleteOption,
      transferToId: deleteOption === 'transfer' ? transferToId : undefined,
    });
    
    setDeleteDialogOpen(false);
    setDeletingProfessional(null);
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

  const canDelete = appointmentCount === 0 || 
    (deleteOption === 'transfer' && transferToId) || 
    deleteOption === 'delete_all';

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

      {/* Delete Dialog with Options */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Excluir Profissional
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Tem certeza que deseja excluir <strong>"{deletingProfessional?.name}"</strong>?
                </p>
                
                {loadingCount ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : appointmentCount > 0 ? (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 space-y-3">
                    <p className="font-medium text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {appointmentCount} agendamento(s) vinculado(s)
                    </p>
                    <p className="text-sm text-muted-foreground">
                      O que deseja fazer com estes agendamentos?
                    </p>
                    
                    <RadioGroup 
                      value={deleteOption} 
                      onValueChange={(v) => setDeleteOption(v as DeleteAction)}
                      className="space-y-3"
                    >
                      {otherProfessionals.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="transfer" id="transfer" />
                            <Label htmlFor="transfer" className="cursor-pointer">
                              Transferir para outro profissional
                            </Label>
                          </div>
                          
                          {deleteOption === 'transfer' && (
                            <Select value={transferToId} onValueChange={setTransferToId}>
                              <SelectTrigger className="ml-6">
                                <SelectValue placeholder="Selecionar profissional..." />
                              </SelectTrigger>
                              <SelectContent>
                                {otherProfessionals.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    <div className="flex items-center gap-2">
                                      <div 
                                        className="w-3 h-3 rounded-full" 
                                        style={{ backgroundColor: p.color }}
                                      />
                                      {p.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="delete_all" id="delete_all" />
                        <Label htmlFor="delete_all" className="text-destructive cursor-pointer">
                          Excluir todos os agendamentos junto
                        </Label>
                      </div>
                    </RadioGroup>
                    
                    {deleteOption === 'delete_all' && (
                      <p className="text-xs text-destructive font-medium bg-destructive/10 p-2 rounded">
                        ⚠️ Esta ação é irreversível! Todos os {appointmentCount} agendamentos serão excluídos permanentemente.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Este profissional não possui agendamentos vinculados.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteWithOptions} 
              disabled={!canDelete || deleteProfessionalWithOptions.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProfessionalWithOptions.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Confirmar Exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
