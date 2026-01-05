import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Upload, Download, User, SlidersHorizontal, MoreVertical, Trash2, Merge, MessageCircle } from "lucide-react";
import { NewContactDialog } from "@/components/contacts/NewContactDialog";
import { ImportContactsDialog } from "@/components/contacts/ImportContactsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClients } from "@/hooks/useClients";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useDepartments } from "@/hooks/useDepartments";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useTags } from "@/hooks/useTags";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { exportToExcel, getFormattedDate } from "@/lib/exportUtils";

export default function Contacts() {
  const { clients, isLoading, createClient, deleteClient, unifyDuplicates, updateClientStatus } = useClients();
  const { statuses } = useCustomStatuses();
  const { departments } = useDepartments();
  const { members: teamMembers } = useTeamMembers();
  const { tags } = useTags();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [filterResponsible, setFilterResponsible] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  
  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Bulk delete state
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.phone.includes(search) ||
      client.email?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = filterStatus === "all" || client.custom_status_id === filterStatus;
    const matchesDepartment = filterDepartment === "all" || client.department_id === filterDepartment;

    return matchesSearch && matchesStatus && matchesDepartment;
  });


  const handleCreateFromPhone = async (phone: string) => {
    await createClient.mutateAsync({
      name: `Contato ${phone.slice(-4)}`,
      phone,
      email: "",
      document: "",
      address: "",
      notes: "",
      lgpd_consent: false,
      lgpd_consent_date: null,
      custom_status_id: null,
      department_id: null,
    });
    setDialogOpen(false);
    // Navigate to conversations to start chat
    navigate(`/conversations?phone=${encodeURIComponent(phone)}`);
  };

  const handleImportContacts = async (file: File, connectionId?: string) => {
    const reader = new FileReader();
    
    return new Promise<void>((resolve, reject) => {
      reader.onload = async (event) => {
        try {
          const text = event.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          
          let imported = 0;
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const nameIdx = headers.findIndex(h => h.includes('nome') || h === 'name');
            const phoneIdx = headers.findIndex(h => h.includes('telefone') || h.includes('phone') || h.includes('celular'));
            const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('e-mail'));
            
            if (nameIdx >= 0 && phoneIdx >= 0 && values[nameIdx] && values[phoneIdx]) {
              await createClient.mutateAsync({
                name: values[nameIdx],
                phone: values[phoneIdx],
                email: emailIdx >= 0 ? values[emailIdx] : "",
                document: "",
                address: "",
                notes: "",
                lgpd_consent: false,
                lgpd_consent_date: null,
                custom_status_id: null,
                department_id: null,
              });
              imported++;
            }
          }
          
          toast({ title: `${imported} contatos importados com sucesso` });
          resolve();
        } catch (error) {
          toast({ title: "Erro ao importar arquivo", variant: "destructive" });
          reject(error);
        }
      };
      reader.readAsText(file);
    });
  };

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 12) {
      const country = cleaned.slice(0, 2);
      const ddd = cleaned.slice(2, 4);
      const part1 = cleaned.slice(4, 8);
      const part2 = cleaned.slice(8, 12);
      return `+${country} (${ddd}) ${part1}-${part2}`;
    }
    return phone;
  };

  const getStatusById = (id: string | null) => statuses.find((s) => s.id === id);
  const getDepartmentById = (id: string | null) => departments.find((d) => d.id === id);

  const toggleSelectAll = () => {
    if (selectedContacts.length === filteredClients.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(filteredClients.map((c) => c.id));
    }
  };

  const toggleSelectContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((cid) => cid !== id) : [...prev, id]
    );
  };

  const handleStatusChange = (clientId: string, statusId: string) => {
    const normalizedStatusId = statusId === "none" ? null : statusId;

    updateClientStatus.mutate(
      { clientId, statusId: normalizedStatusId },
      {
        onSuccess: (data: any) => {
          const created = typeof data?.follow_ups_created === "number" ? data.follow_ups_created : null;

          if (created === 0) {
            toast({
              title: "Status atualizado",
              description: "Nenhum follow-up configurado para este status.",
            });
            return;
          }

          if (typeof created === "number" && created > 0) {
            toast({
              title: "Status atualizado",
              description: `${created} follow-up(s) agendado(s).`,
            });
            return;
          }

          toast({ title: "Status atualizado" });
        },
        onError: (error) => {
          toast({
            title: "Erro ao atualizar status",
            description: error.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleExport = () => {
    const dataToExport = filteredClients.map((client) => {
      const status = getStatusById(client.custom_status_id);
      const department = getDepartmentById(client.department_id);
      return {
        Nome: client.name,
        Telefone: formatPhone(client.phone),
        Email: client.email || "",
        CPF_CNPJ: client.document || "",
        Status: status?.name || "",
        Departamento: department?.name || "",
        Endereco: client.address || "",
        Observacoes: client.notes || "",
        Criado_Em: format(new Date(client.created_at), "dd/MM/yyyy", { locale: ptBR }),
      };
    });
    exportToExcel(dataToExport, `contatos-${getFormattedDate()}`, "Contatos");
    toast({ title: "Contatos exportados com sucesso" });
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Search and Filters Row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar contatos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-muted/30 border-border"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={filterResponsible} onValueChange={setFilterResponsible}>
            <SelectTrigger className="w-[150px] bg-muted/30">
              <User className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {teamMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[130px] bg-muted/30">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {statuses.map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  {status.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterDepartment} onValueChange={setFilterDepartment}>
            <SelectTrigger className="w-[150px] bg-muted/30">
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Mais filtros
          </Button>

          <Button variant="outline" className="gap-2" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4" />
            Importar em Massa
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Exportar
          </Button>

          <Button 
            variant="outline" 
            className="gap-2" 
            onClick={() => unifyDuplicates.mutate()}
            disabled={unifyDuplicates.isPending}
          >
            <Merge className="h-4 w-4" />
            {unifyDuplicates.isPending ? "Unificando..." : "Unificar Duplicados"}
          </Button>

          {selectedContacts.length > 0 && (
            <Button 
              variant="destructive" 
              className="gap-2" 
              onClick={() => setBulkDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Excluir ({selectedContacts.length})
            </Button>
          )}

          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Novo Contato
          </Button>

          {/* New Contact Dialog */}
          <NewContactDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            onCreate={handleCreateFromPhone}
            onOpenImport={() => setImportDialogOpen(true)}
            isCreating={createClient.isPending}
          />

          {/* Import Contacts Dialog */}
          <ImportContactsDialog
            open={importDialogOpen}
            onClose={() => setImportDialogOpen(false)}
            onImport={handleImportContacts}
          />
        </div>
      </div>

      {/* Contacts Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum contato encontrado</p>
            <p className="text-sm">Clique em "Novo Contato" para adicionar</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedContacts.length === filteredClients.length && filteredClients.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-16">Foto</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Conexão</TableHead>
                <TableHead>Criado Em</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => {
                const status = getStatusById(client.custom_status_id);
                const department = getDepartmentById(client.department_id);
                // Mock data for demonstration - would be fetched from conversations
                const mockResponsible = teamMembers[0];
                const mockOrigin = "—";
                const mockConnection = client.phone.replace(/\D/g, '');

                return (
                  <TableRow key={client.id} className="hover:bg-muted/20">
                    <TableCell>
                      <Checkbox
                        checked={selectedContacts.includes(client.id)}
                        onCheckedChange={() => toggleSelectContact(client.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Avatar className="h-9 w-9">
                        <AvatarFallback 
                          className="text-xs font-medium"
                          style={{ 
                            backgroundColor: `hsl(${client.name.charCodeAt(0) * 10 % 360}, 70%, 50%)`,
                            color: 'white'
                          }}
                        >
                          {client.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {formatPhone(client.phone)}
                    </TableCell>
                    <TableCell>
                      {mockResponsible ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={mockResponsible.avatar_url || undefined} />
                            <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                              {mockResponsible.full_name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{mockResponsible.full_name.split(' ')[0]}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={client.custom_status_id || "none"}
                        onValueChange={(val) => handleStatusChange(client.id, val)}
                      >
                        <SelectTrigger className="h-7 w-auto min-w-[100px] border-0 bg-transparent hover:bg-muted/50">
                          <SelectValue placeholder="Status" />
                          <span className="sr-only">Status</span>
                          {status ? (
                            <Badge 
                              variant="outline"
                              style={{ 
                                backgroundColor: `${status.color}20`,
                                borderColor: status.color,
                                color: status.color
                              }}
                            >
                              {status.name}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-500 text-emerald-500 bg-emerald-500/10">
                              Aberto
                            </Badge>
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-emerald-600">Aberto</span>
                          </SelectItem>
                          {statuses.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ backgroundColor: s.color }} 
                                />
                                {s.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {department ? (
                        <Badge 
                          variant="secondary"
                          style={{ 
                            backgroundColor: `${department.color}20`,
                            color: department.color
                          }}
                        >
                          {department.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">—</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">—</span>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {mockConnection || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDistanceToNow(new Date(client.created_at), { 
                        addSuffix: true, 
                        locale: ptBR 
                      }).replace('há cerca de ', 'há ').replace('há menos de ', 'há ')}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              navigate(`/conversations?phone=${encodeURIComponent(client.phone)}&name=${encodeURIComponent(client.name)}`);
                            }}
                          >
                            <MessageCircle className="h-4 w-4 mr-2" />
                            Iniciar conversa
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setContactToDelete({ id: client.id, name: client.name });
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir contato
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Delete Single Contact Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{contactToDelete?.name}</strong>?
              <br /><br />
              <span className="text-destructive font-medium">
                Esta ação irá remover permanentemente:
              </span>
              <ul className="list-disc list-inside mt-2 text-sm space-y-1">
                <li>Todas as conversas do contato</li>
                <li>Todas as mensagens salvas</li>
                <li>Histórico de ações</li>
                <li>Tags e memórias associadas</li>
                <li>Casos e documentos vinculados</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={async () => {
                if (!contactToDelete) return;
                setIsDeleting(true);
                try {
                  await deleteClient.mutateAsync(contactToDelete.id);
                  setDeleteDialogOpen(false);
                  setContactToDelete(null);
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              {isDeleting ? "Excluindo..." : "Excluir permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedContacts.length} contatos?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-destructive font-medium">
                Esta ação irá remover permanentemente todos os contatos selecionados e seus dados associados:
              </span>
              <ul className="list-disc list-inside mt-2 text-sm space-y-1">
                <li>Todas as conversas</li>
                <li>Todas as mensagens</li>
                <li>Histórico, tags, memórias, casos e documentos</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={async () => {
                setIsDeleting(true);
                try {
                  const results = await Promise.allSettled(
                    selectedContacts.map((id) => deleteClient.mutateAsync(id))
                  );

                  const successCount = results.filter((r) => r.status === "fulfilled").length;
                  const failCount = results.length - successCount;

                  setSelectedContacts([]);
                  setBulkDeleteDialogOpen(false);

                  if (failCount > 0) {
                    toast({
                      title: `${successCount} contatos excluídos`,
                      description: `${failCount} não puderam ser excluídos (permissão ou dados).`,
                      variant: "destructive",
                    });
                  } else {
                    toast({ title: `${successCount} contatos excluídos` });
                  }
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              {isDeleting ? "Excluindo..." : `Excluir ${selectedContacts.length} contatos`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}