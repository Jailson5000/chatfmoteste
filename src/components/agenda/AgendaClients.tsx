import { useState } from "react";
import { Plus, Pencil, Trash2, Users, Phone, Mail, Calendar, Cake, Search } from "lucide-react";
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
import { useAgendaClients, AgendaClient } from "@/hooks/useAgendaClients";
import { formatPhone, formatDocument } from "@/lib/inputMasks";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClientFormData {
  name: string;
  phone: string;
  email: string;
  document: string;
  address: string;
  notes: string;
  birth_date: string;
  birthday_message_enabled: boolean;
}

const defaultFormData: ClientFormData = {
  name: "",
  phone: "",
  email: "",
  document: "",
  address: "",
  notes: "",
  birth_date: "",
  birthday_message_enabled: false,
};

export function AgendaClients() {
  const { clients, isLoading, createClient, updateClient, deleteClient, getUpcomingBirthdays } = useAgendaClients();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<AgendaClient | null>(null);
  const [deletingClient, setDeletingClient] = useState<AgendaClient | null>(null);
  const [formData, setFormData] = useState<ClientFormData>(defaultFormData);
  const [searchQuery, setSearchQuery] = useState("");

  const upcomingBirthdays = getUpcomingBirthdays(30);
  const filteredClients = searchQuery
    ? clients.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.phone.includes(searchQuery) ||
          c.email?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : clients;

  const handleOpenNew = () => {
    setEditingClient(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  };

  const handleEdit = (client: AgendaClient) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      phone: client.phone || "",
      email: client.email || "",
      document: client.document || "",
      address: client.address || "",
      notes: client.notes || "",
      birth_date: client.birth_date || "",
      birthday_message_enabled: client.birthday_message_enabled ?? false,
    });
    setDialogOpen(true);
  };

  const handleDelete = (client: AgendaClient) => {
    setDeletingClient(client);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deletingClient) {
      await deleteClient.mutateAsync(deletingClient.id);
      setDeleteDialogOpen(false);
      setDeletingClient(null);
    }
  };

  const handleSubmit = async () => {
    const data = {
      name: formData.name,
      phone: formData.phone.replace(/\D/g, ""),
      email: formData.email || null,
      document: formData.document || null,
      address: formData.address || null,
      notes: formData.notes || null,
      birth_date: formData.birth_date || null,
      birthday_message_enabled: formData.birthday_message_enabled,
    };

    if (editingClient) {
      await updateClient.mutateAsync({ id: editingClient.id, ...data });
    } else {
      await createClient.mutateAsync(data);
    }

    setDialogOpen(false);
    setEditingClient(null);
    setFormData(defaultFormData);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  const formatBirthDate = (date: string) => {
    try {
      return format(new Date(date), "dd 'de' MMMM", { locale: ptBR });
    } catch {
      return date;
    }
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold">Clientes</h2>
          <p className="text-sm text-muted-foreground">
            Cadastro de clientes para fidelização e aniversários
          </p>
        </div>
        <Button onClick={handleOpenNew}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Cliente
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone ou email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Upcoming Birthdays */}
      {upcomingBirthdays.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Cake className="h-4 w-4" />
              Aniversários Próximos (30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {upcomingBirthdays.map((client) => (
                <Badge key={client.id} variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
                  {client.name} - {formatBirthDate(client.birth_date!)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {filteredClients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {searchQuery ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery
                ? "Tente buscar com outros termos"
                : "Cadastre clientes para fidelização e mensagens de aniversário"}
            </p>
            {!searchQuery && (
              <Button onClick={handleOpenNew}>
                <Plus className="h-4 w-4 mr-2" />
                Cadastrar Cliente
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredClients.map((client) => (
            <Card key={client.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(client.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">{client.name}</CardTitle>
                      {client.birth_date && (
                        <CardDescription className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatBirthDate(client.birth_date)}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  {client.birthday_message_enabled && (
                    <Badge variant="secondary" className="text-xs">
                      <Cake className="h-3 w-3 mr-1" />
                      Msg
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{formatPhone(client.phone)}</span>
                  </div>
                  {client.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(client)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(client)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Client Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingClient ? "Editar Cliente" : "Novo Cliente"}
            </DialogTitle>
            <DialogDescription>
              Preencha as informações do cliente
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
                <Label htmlFor="phone">Telefone *</Label>
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
                  value={formatDocument(formData.document)}
                  onChange={(e) => setFormData({ ...formData, document: e.target.value.replace(/\D/g, "") })}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birth_date">Data de Nascimento</Label>
                <Input
                  id="birth_date"
                  type="date"
                  value={formData.birth_date}
                  onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Endereço</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Rua, número, bairro..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Anotações sobre o cliente..."
                rows={2}
              />
            </div>

            <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
              <Switch
                id="birthday_message"
                checked={formData.birthday_message_enabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, birthday_message_enabled: checked })
                }
              />
              <div>
                <Label htmlFor="birthday_message" className="cursor-pointer">
                  Mensagem de Aniversário
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enviar mensagem automática no aniversário
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name || !formData.phone || createClient.isPending || updateClient.isPending}
            >
              {editingClient ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O cliente "{deletingClient?.name}" será removido
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
