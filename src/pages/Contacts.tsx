import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Upload, Download, MoreVertical, Trash2, Merge, MessageCircle, User, Globe } from "lucide-react";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/pagination-controls";
import type { DateRange } from "react-day-picker";
import { parseISO, startOfDay, endOfDay } from "date-fns";
import { NewContactDialog } from "@/components/contacts/NewContactDialog";
import { ImportContactsDialog } from "@/components/contacts/ImportContactsDialog";
import { FilterBar } from "@/components/filters/FilterBar";
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
  const { clients, isLoading, createClient, deleteClient, unifyDuplicates } = useClients();
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

  // Multi-select filters
  const [selectedResponsibles, setSelectedResponsibles] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk delete state
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const matchesSearch =
        client.name.toLowerCase().includes(search.toLowerCase()) ||
        client.phone.includes(search) ||
        client.email?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        selectedStatuses.length === 0 ||
        (client.custom_status_id && selectedStatuses.includes(client.custom_status_id));

      const matchesDepartment =
        selectedDepartments.length === 0 ||
        (client.department_id && selectedDepartments.includes(client.department_id));

      const matchesDateRange = (() => {
        if (!dateRange?.from) return true;

        const clientDate = parseISO(client.created_at);
        const start = startOfDay(dateRange.from);
        const end = endOfDay(dateRange.to ?? dateRange.from);

        return clientDate >= start && clientDate <= end;
      })();

      return matchesSearch && matchesStatus && matchesDepartment && matchesDateRange;
    });
  }, [clients, search, selectedStatuses, selectedDepartments, dateRange]);

  // Pagination hook - applied AFTER filtering
  const pagination = usePagination(filteredClients, { initialPageSize: 50 });


  const handleCreateFromPhone = async (phone: string, connectionId?: string) => {
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
      whatsapp_instance_id: connectionId || null,
      assigned_to: null,
    });
    setDialogOpen(false);
    // Navigate to conversations to start chat
    navigate(`/conversations?phone=${encodeURIComponent(phone)}${connectionId ? `&connectionId=${connectionId}` : ''}`);
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
                whatsapp_instance_id: null,
                assigned_to: null,
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
    // Toggle selection for current page only
    const currentPageIds = pagination.paginatedData.map((c) => c.id);
    const allSelected = currentPageIds.every((id) => selectedContacts.includes(id));
    
    if (allSelected) {
      // Deselect all from current page
      setSelectedContacts((prev) => prev.filter((id) => !currentPageIds.includes(id)));
    } else {
      // Select all from current page
      setSelectedContacts((prev) => [...new Set([...prev, ...currentPageIds])]);
    }
  };

  const toggleSelectContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((cid) => cid !== id) : [...prev, id]
    );
  };

  const handleExport = () => {
    const dataToExport = filteredClients.map((client) => {
      const status = getStatusById(client.custom_status_id);
      const department = getDepartmentById(client.department_id);
      
      // Get connection display
      const conversation = client.conversations?.[0];
      const inst = client.whatsapp_instance || conversation?.whatsapp_instance;
      const conexao = conversation?.origin === 'WIDGET' || conversation?.origin === 'WEB' || conversation?.origin === 'TRAY' || conversation?.origin === 'SITE'
        ? 'Chat Web' 
        : (inst?.display_name || inst?.instance_name || '');
      
      return {
        Nome: client.name,
        Telefone: formatPhone(client.phone),
        Email: client.email || "",
        CPF_CNPJ: client.document || "",
        Status: status?.name || "",
        Departamento: department?.name || "",
        Responsavel: client.assigned_profile?.full_name || "",
        Conexao_WhatsApp: conexao,
        Endereco: client.address || "",
        Observacoes: client.notes || "",
        Consentimento_LGPD: client.lgpd_consent ? "Sim" : "Não",
        Data_Consentimento_LGPD: client.lgpd_consent_date 
          ? format(new Date(client.lgpd_consent_date), "dd/MM/yyyy", { locale: ptBR }) 
          : "",
        Criado_Em: format(new Date(client.created_at), "dd/MM/yyyy", { locale: ptBR }),
        Atualizado_Em: format(new Date(client.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      };
    });
    exportToExcel(dataToExport, `contatos-${getFormattedDate()}`, "Contatos");
    toast({ title: "Contatos exportados com sucesso" });
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 animate-fade-in overflow-hidden">
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
          <FilterBar
            selectedResponsibles={selectedResponsibles}
            onResponsiblesChange={setSelectedResponsibles}
            teamMembers={teamMembers.map(m => ({
              id: m.id,
              full_name: m.full_name,
              avatar_url: m.avatar_url,
              type: 'human' as const,
            }))}
            selectedStatuses={selectedStatuses}
            onStatusesChange={setSelectedStatuses}
            statuses={statuses.map(s => ({
              id: s.id,
              name: s.name,
              color: s.color,
            }))}
            selectedDepartments={selectedDepartments}
            onDepartmentsChange={setSelectedDepartments}
            departments={departments.map(d => ({
              id: d.id,
              name: d.name,
              color: d.color,
            }))}
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            tags={tags.map(t => ({
              id: t.id,
              name: t.name,
              color: t.color,
            }))}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            connections={[]}
            resultsCount={filteredClients.length}
          />

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
      <div className="flex-1 min-h-0 rounded-lg border bg-card overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
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
                    checked={selectedContacts.length === pagination.paginatedData.length && pagination.paginatedData.length > 0}
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
                <TableHead>Conexão</TableHead>
                <TableHead>Criado Em</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedData.map((client) => {
                const status = getStatusById(client.custom_status_id);
                const department = getDepartmentById(client.department_id);
                
                // Get WhatsApp instance display or web origin:
                // 1) Check if conversation origin is from web widget
                // 2) client.whatsapp_instance_id if set
                // 3) fallback to last conversation instance
                const getConnectionDisplay = () => {
                  const conversation = client.conversations?.[0];
                  
                  // Check if from web widget
                  if (conversation?.origin === 'WIDGET' || conversation?.origin === 'TRAY' || conversation?.origin === 'WEB' || conversation?.origin === 'SITE') {
                    return { type: 'web', label: 'Chat Web' };
                  }
                  
                  const inst =
                    client.whatsapp_instance || conversation?.whatsapp_instance || null;

                  if (!inst) return null;

                  const phoneNumber = inst.phone_number;
                  if (phoneNumber) {
                    const digits = phoneNumber.replace(/\D/g, "");
                    if (digits.length >= 4) return { type: 'whatsapp', label: `•••${digits.slice(-4)}` };
                  }

                  return { type: 'whatsapp', label: inst.display_name || inst.instance_name || null };
                };
                const connectionDisplay = getConnectionDisplay();

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
                      {client.assigned_profile?.full_name ? (
                        <span className="text-sm">{client.assigned_profile.full_name}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
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
                    <TableCell className="text-sm">
                      {connectionDisplay ? (
                        <div className="flex items-center gap-1.5">
                          {connectionDisplay.type === 'web' ? (
                            <>
                              <Globe className="h-3.5 w-3.5 text-blue-500" />
                              <span className="text-blue-500 font-medium">{connectionDisplay.label}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">{connectionDisplay.label}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
                              const connId = client.whatsapp_instance_id || (client as any).conversations?.[0]?.whatsapp_instance_id || '';
                              navigate(`/conversations?phone=${encodeURIComponent(client.phone)}&name=${encodeURIComponent(client.name)}${connId ? `&connectionId=${connId}` : ''}`);
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
        {/* Pagination Controls */}
        {!isLoading && filteredClients.length > 0 && (
          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            hasNextPage={pagination.hasNextPage}
            hasPrevPage={pagination.hasPrevPage}
            pageSizeOptions={pagination.pageSizeOptions}
            onPageChange={pagination.goToPage}
            onPageSizeChange={pagination.setPageSize}
            onNextPage={pagination.nextPage}
            onPrevPage={pagination.prevPage}
          />
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