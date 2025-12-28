import { useState, useRef } from "react";
import { Plus, Search, Upload, User, SlidersHorizontal } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useClients } from "@/hooks/useClients";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useDepartments } from "@/hooks/useDepartments";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useTags } from "@/hooks/useTags";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Contacts() {
  const { clients, isLoading, createClient, deleteClient } = useClients();
  const { statuses } = useCustomStatuses();
  const { departments } = useDepartments();
  const { members: teamMembers } = useTeamMembers();
  const { tags } = useTags();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [filterResponsible, setFilterResponsible] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    document: "",
    address: "",
    notes: "",
    lgpd_consent: false,
    lgpd_consent_date: null as string | null,
    custom_status_id: null as string | null,
    department_id: null as string | null,
  });

  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.phone.includes(search) ||
      client.email?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = filterStatus === "all" || client.custom_status_id === filterStatus;
    const matchesDepartment = filterDepartment === "all" || client.department_id === filterDepartment;

    return matchesSearch && matchesStatus && matchesDepartment;
  });


  const handleCreate = async () => {
    await createClient.mutateAsync(formData);
    setDialogOpen(false);
    setFormData({
      name: "",
      phone: "",
      email: "",
      document: "",
      address: "",
      notes: "",
      lgpd_consent: false,
      lgpd_consent_date: null,
      custom_status_id: null,
      department_id: null,
    });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
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
        setImportDialogOpen(false);
      } catch (error) {
        toast({ title: "Erro ao importar arquivo", variant: "destructive" });
      }
    };
    reader.readAsText(file);
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

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Contato
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Novo Contato</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone *</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="document">CPF/CNPJ</Label>
                    <Input
                      id="document"
                      value={formData.document}
                      onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                      placeholder="000.000.000-00"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Rua, número, bairro, cidade"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Notas sobre o contato..."
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!formData.name || !formData.phone || createClient.isPending}
                  >
                    {createClient.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Contatos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Selecione um arquivo CSV com as colunas: Nome, Telefone, Email (opcional)
            </p>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.txt"
              onChange={handleImportFile}
              className="hidden"
            />
            <Button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              Selecionar Arquivo CSV
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}