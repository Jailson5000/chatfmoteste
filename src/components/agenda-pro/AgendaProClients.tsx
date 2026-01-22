import { useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Users, Search, Phone, Mail, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { useAgendaProClients, AgendaProClient } from "@/hooks/useAgendaProClients";
import { formatPhone, formatDocument } from "@/lib/inputMasks";

interface ClientFormData {
  name: string;
  email: string;
  phone: string;
  document: string;
  rg: string;
  birth_date: string;
  gender: string;
  origin: string;
  profession: string;
  marital_status: string;
  notes: string;
  is_active: boolean;
  receive_notifications: boolean;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  address_cep: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
}

const defaultFormData: ClientFormData = {
  name: "",
  email: "",
  phone: "",
  document: "",
  rg: "",
  birth_date: "",
  gender: "",
  origin: "",
  profession: "",
  marital_status: "",
  notes: "",
  is_active: true,
  receive_notifications: true,
  emergency_contact_name: "",
  emergency_contact_phone: "",
  address_cep: "",
  address_street: "",
  address_number: "",
  address_complement: "",
  address_neighborhood: "",
  address_city: "",
  address_state: "",
};

const GENDER_OPTIONS = [
  { value: "feminino", label: "Feminino" },
  { value: "masculino", label: "Masculino" },
  { value: "outro", label: "Outro" },
  { value: "nao_informar", label: "Prefiro não informar" },
];

const MARITAL_STATUS_OPTIONS = [
  { value: "solteiro", label: "Solteiro(a)" },
  { value: "casado", label: "Casado(a)" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viuvo", label: "Viúvo(a)" },
  { value: "uniao_estavel", label: "União Estável" },
];

const ORIGIN_OPTIONS = [
  { value: "indicacao", label: "Indicação" },
  { value: "google", label: "Google" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "site", label: "Site" },
  { value: "outro", label: "Outro" },
];

const STATE_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

export function AgendaProClients() {
  const { clients, isLoading, createClient, updateClient, deleteClient, searchClients } = useAgendaProClients();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<AgendaProClient | null>(null);
  const [deletingClient, setDeletingClient] = useState<AgendaProClient | null>(null);
  const [formData, setFormData] = useState<ClientFormData>(defaultFormData);
  const [searchQuery, setSearchQuery] = useState("");
  const [additionalInfoOpen, setAdditionalInfoOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);

  const filteredClients = searchQuery ? searchClients(searchQuery) : clients;

  const handleOpenNew = () => {
    setEditingClient(null);
    setFormData(defaultFormData);
    setAdditionalInfoOpen(false);
    setEmergencyOpen(false);
    setAddressOpen(false);
    setDialogOpen(true);
  };

  const handleEdit = (client: AgendaProClient) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      email: client.email || "",
      phone: client.phone ? formatPhone(client.phone) : "",
      document: client.document ? formatDocument(client.document) : "",
      rg: client.rg || "",
      birth_date: client.birth_date || "",
      gender: client.gender || "",
      origin: client.origin || "",
      profession: client.profession || "",
      marital_status: client.marital_status || "",
      notes: client.notes || "",
      is_active: client.is_active,
      receive_notifications: client.receive_notifications ?? true,
      emergency_contact_name: client.emergency_contact_name || "",
      emergency_contact_phone: client.emergency_contact_phone ? formatPhone(client.emergency_contact_phone) : "",
      address_cep: client.address_cep || "",
      address_street: client.address_street || "",
      address_number: client.address_number || "",
      address_complement: client.address_complement || "",
      address_neighborhood: client.address_neighborhood || "",
      address_city: client.address_city || "",
      address_state: client.address_state || "",
    });
    setAdditionalInfoOpen(false);
    setEmergencyOpen(false);
    setAddressOpen(false);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const phoneDigits = formData.phone.replace(/\D/g, '');
    const emergencyPhoneDigits = formData.emergency_contact_phone.replace(/\D/g, '');
    
    const data = {
      name: formData.name,
      email: formData.email || null,
      phone: phoneDigits || null,
      document: formData.document.replace(/\D/g, '') || null,
      rg: formData.rg || null,
      birth_date: formData.birth_date || null,
      gender: formData.gender || null,
      origin: formData.origin || null,
      profession: formData.profession || null,
      marital_status: formData.marital_status || null,
      notes: formData.notes || null,
      is_active: formData.is_active,
      receive_notifications: formData.receive_notifications,
      emergency_contact_name: formData.emergency_contact_name || null,
      emergency_contact_phone: emergencyPhoneDigits || null,
      address_cep: formData.address_cep || null,
      address_street: formData.address_street || null,
      address_number: formData.address_number || null,
      address_complement: formData.address_complement || null,
      address_neighborhood: formData.address_neighborhood || null,
      address_city: formData.address_city || null,
      address_state: formData.address_state || null,
    };

    if (editingClient) {
      await updateClient.mutateAsync({ id: editingClient.id, ...data });
    } else {
      await createClient.mutateAsync(data);
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (deletingClient) {
      deleteClient.mutate(deletingClient.id);
      setDeleteDialogOpen(false);
      setDeletingClient(null);
    }
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Clientes</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={handleOpenNew} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo Cliente</span>
          </Button>
        </div>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium">Nenhum cliente cadastrado</h3>
            <p className="text-sm text-muted-foreground mb-4">Clientes serão criados automaticamente ao agendar</p>
            <Button onClick={handleOpenNew}>Adicionar Cliente</Button>
          </CardContent>
        </Card>
      ) : filteredClients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-[150px] text-center">
            <Search className="h-8 w-8 text-muted-foreground mb-2" />
            <h3 className="font-medium">Nenhum cliente encontrado</h3>
            <p className="text-sm text-muted-foreground">Tente outra busca</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((client) => (
            <Card key={client.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleEdit(client)}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {getInitials(client.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{client.name}</div>
                    <div className="space-y-1 mt-1">
                      {client.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {formatPhone(client.phone)}
                        </div>
                      )}
                      {client.email && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                          <Mail className="h-3 w-3" />
                          {client.email}
                        </div>
                      )}
                    </div>
                    {client.total_appointments > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                        <Calendar className="h-3 w-3" />
                        {client.total_appointments} agendamento{client.total_appointments > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(client);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingClient(client);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle>{editingClient ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="max-h-[calc(90vh-140px)] px-6">
            <div className="space-y-6 pb-4">
              {/* Basic Info */}
              <div className="space-y-4">
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
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="birth_date">Data de Nascimento</Label>
                    <Input
                      id="birth_date"
                      type="date"
                      value={formData.birth_date}
                      onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="gender">Sexo</Label>
                    <Select
                      value={formData.gender}
                      onValueChange={(value) => setFormData({ ...formData, gender: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDER_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="document">CPF</Label>
                    <Input
                      id="document"
                      value={formData.document}
                      onChange={(e) => setFormData({ ...formData, document: formatDocument(e.target.value) })}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rg">RG</Label>
                    <Input
                      id="rg"
                      value={formData.rg}
                      onChange={(e) => setFormData({ ...formData, rg: e.target.value })}
                      placeholder="Digite o RG"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label htmlFor="is_active" className="cursor-pointer">Ativo</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="receive_notifications"
                      checked={formData.receive_notifications}
                      onCheckedChange={(checked) => setFormData({ ...formData, receive_notifications: checked })}
                    />
                    <Label htmlFor="receive_notifications" className="cursor-pointer">Recebe notificações</Label>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Additional Info Section */}
              <Collapsible open={additionalInfoOpen} onOpenChange={setAdditionalInfoOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full py-2 hover:bg-muted/50 rounded-md px-2 -mx-2">
                  <span className="font-medium">Informações adicionais</span>
                  {additionalInfoOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="origin">Origem</Label>
                      <Select
                        value={formData.origin}
                        onValueChange={(value) => setFormData({ ...formData, origin: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Como conheceu?" />
                        </SelectTrigger>
                        <SelectContent>
                          {ORIGIN_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="marital_status">Estado Civil</Label>
                      <Select
                        value={formData.marital_status}
                        onValueChange={(value) => setFormData({ ...formData, marital_status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {MARITAL_STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="profession">Profissão</Label>
                    <Input
                      id="profession"
                      value={formData.profession}
                      onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
                      placeholder="Ex: Advogado, Médico, Professor..."
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Anotações sobre o cliente..."
                      rows={3}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              {/* Emergency Contact Section */}
              <Collapsible open={emergencyOpen} onOpenChange={setEmergencyOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full py-2 hover:bg-muted/50 rounded-md px-2 -mx-2">
                  <span className="font-medium">Contato de emergência</span>
                  {emergencyOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="emergency_contact_name">Nome</Label>
                      <Input
                        id="emergency_contact_name"
                        value={formData.emergency_contact_name}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                        placeholder="Nome do contato"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="emergency_contact_phone">Telefone</Label>
                      <Input
                        id="emergency_contact_phone"
                        value={formData.emergency_contact_phone}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_phone: formatPhone(e.target.value) })}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              {/* Address Section */}
              <Collapsible open={addressOpen} onOpenChange={setAddressOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full py-2 hover:bg-muted/50 rounded-md px-2 -mx-2">
                  <span className="font-medium">Endereço</span>
                  {addressOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="address_cep">CEP</Label>
                      <Input
                        id="address_cep"
                        value={formData.address_cep}
                        onChange={(e) => setFormData({ ...formData, address_cep: e.target.value })}
                        placeholder="00000-000"
                        maxLength={9}
                      />
                    </div>
                    <div className="grid gap-2 col-span-2">
                      <Label htmlFor="address_street">Rua</Label>
                      <Input
                        id="address_street"
                        value={formData.address_street}
                        onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                        placeholder="Nome da rua"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="address_number">Número</Label>
                      <Input
                        id="address_number"
                        value={formData.address_number}
                        onChange={(e) => setFormData({ ...formData, address_number: e.target.value })}
                        placeholder="Nº"
                      />
                    </div>
                    <div className="grid gap-2 col-span-3">
                      <Label htmlFor="address_complement">Complemento</Label>
                      <Input
                        id="address_complement"
                        value={formData.address_complement}
                        onChange={(e) => setFormData({ ...formData, address_complement: e.target.value })}
                        placeholder="Apto, Bloco, etc."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="address_neighborhood">Bairro</Label>
                      <Input
                        id="address_neighborhood"
                        value={formData.address_neighborhood}
                        onChange={(e) => setFormData({ ...formData, address_neighborhood: e.target.value })}
                        placeholder="Bairro"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="address_city">Cidade</Label>
                      <Input
                        id="address_city"
                        value={formData.address_city}
                        onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                        placeholder="Cidade"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="address_state">Estado</Label>
                      <Select
                        value={formData.address_state}
                        onValueChange={(value) => setFormData({ ...formData, address_state: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent>
                          {STATE_OPTIONS.map((uf) => (
                            <SelectItem key={uf} value={uf}>
                              {uf}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>

          <DialogFooter className="p-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.name || createClient.isPending || updateClient.isPending}>
              {(createClient.isPending || updateClient.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingClient ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover "{deletingClient?.name}"? Os agendamentos anteriores serão mantidos.
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
