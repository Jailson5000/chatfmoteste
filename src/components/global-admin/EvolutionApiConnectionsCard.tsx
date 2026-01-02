import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Server,
  MoreVertical,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Star,
  StarOff,
  Eye,
  EyeOff,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface EvolutionConnection {
  id: string;
  name: string;
  description: string | null;
  api_url: string;
  api_key: string;
  is_active: boolean;
  is_default: boolean;
  last_health_check_at: string | null;
  health_status: string | null;
  health_latency_ms: number | null;
  created_at: string;
  updated_at: string;
}

export function EvolutionApiConnectionsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<EvolutionConnection | null>(null);
  const [showApiKey, setShowApiKey] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    api_url: "",
    api_key: "",
    is_active: true,
    is_default: false,
  });

  // Fetch connections
  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["evolution-api-connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evolution_api_connections")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as EvolutionConnection[];
    },
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from("evolution_api_connections")
          .update({
            name: data.name,
            description: data.description || null,
            api_url: data.api_url,
            api_key: data.api_key,
            is_active: data.is_active,
            is_default: data.is_default,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("evolution_api_connections")
          .insert({
            name: data.name,
            description: data.description || null,
            api_url: data.api_url,
            api_key: data.api_key,
            is_active: data.is_active,
            is_default: data.is_default,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evolution-api-connections"] });
      toast({
        title: editingConnection ? "Conexão atualizada" : "Conexão adicionada",
        description: "A conexão Evolution API foi salva com sucesso.",
      });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("evolution_api_connections")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evolution-api-connections"] });
      toast({
        title: "Conexão removida",
        description: "A conexão Evolution API foi removida.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Test connection mutation - uses edge function to avoid CORS issues
  const testConnectionMutation = useMutation({
    mutationFn: async (connection: EvolutionConnection) => {
      const startTime = Date.now();
      
      // Use the edge function to test connection (avoids CORS)
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "test_connection",
          apiUrl: connection.api_url,
          apiKey: connection.api_key,
        },
      });
      
      const latency = Date.now() - startTime;
      const status = error ? "offline" : "online";

      // Update in database
      await supabase
        .from("evolution_api_connections")
        .update({
          health_status: status,
          health_latency_ms: latency,
          last_health_check_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      if (error) {
        throw new Error(error.message || "Falha na conexão");
      }

      return { status, latency };
    },
    onSuccess: (data, connection) => {
      queryClient.invalidateQueries({ queryKey: ["evolution-api-connections"] });
      toast({
        title: "Conexão OK",
        description: `${connection.name}: ${data.latency}ms`,
      });
    },
    onError: (error: Error, connection) => {
      supabase
        .from("evolution_api_connections")
        .update({
          health_status: "offline",
          last_health_check_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      queryClient.invalidateQueries({ queryKey: ["evolution-api-connections"] });
      toast({
        title: "Conexão falhou",
        description: error.message || "API não responde",
        variant: "destructive",
      });
    },
  });

  const handleOpenDialog = (connection?: EvolutionConnection) => {
    if (connection) {
      setEditingConnection(connection);
      setFormData({
        name: connection.name,
        description: connection.description || "",
        api_url: connection.api_url,
        api_key: connection.api_key,
        is_active: connection.is_active,
        is_default: connection.is_default,
      });
    } else {
      setEditingConnection(null);
      setFormData({
        name: "",
        description: "",
        api_url: "",
        api_key: "",
        is_active: true,
        is_default: false,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingConnection(null);
    setFormData({
      name: "",
      description: "",
      api_url: "",
      api_key: "",
      is_active: true,
      is_default: false,
    });
  };

  const handleSave = () => {
    if (!formData.name || !formData.api_url || !formData.api_key) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha nome, URL e API Key.",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate({
      ...formData,
      id: editingConnection?.id,
    });
  };

  const getHealthBadge = (connection: EvolutionConnection) => {
    if (!connection.health_status || connection.health_status === "unknown") {
      return <Badge variant="outline">Não testado</Badge>;
    }
    if (connection.health_status === "online") {
      return (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Online
          {connection.health_latency_ms && ` (${connection.health_latency_ms}ms)`}
        </Badge>
      );
    }
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3 mr-1" />
        Offline
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Provedores Evolution API
          <Badge variant="secondary" className="ml-2">
            {connections.length}
          </Badge>
        </CardTitle>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Conexão
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : connections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Server className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Nenhuma conexão Evolution API configurada</p>
            <p className="text-sm mt-1">Clique em "Adicionar Conexão" para começar</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Saúde</TableHead>
                <TableHead>Última Verificação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.map((connection) => (
                <TableRow key={connection.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{connection.name}</span>
                      {connection.is_default && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          </TooltipTrigger>
                          <TooltipContent>Conexão padrão</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    {connection.description && (
                      <p className="text-xs text-muted-foreground">{connection.description}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {connection.api_url}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={connection.is_active ? "default" : "secondary"}>
                      {connection.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>{getHealthBadge(connection)}</TableCell>
                  <TableCell>
                    {connection.last_health_check_at ? (
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(connection.last_health_check_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => testConnectionMutation.mutate(connection)}
                          disabled={testConnectionMutation.isPending}
                        >
                          <RefreshCw className={`h-4 w-4 mr-2 ${testConnectionMutation.isPending ? "animate-spin" : ""}`} />
                          Testar Conexão
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenDialog(connection)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => deleteMutation.mutate(connection.id)}
                          disabled={deleteMutation.isPending}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingConnection ? "Editar Conexão" : "Nova Conexão Evolution API"}
            </DialogTitle>
            <DialogDescription>
              Configure os dados de acesso à API Evolution.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Ex: Evolution Principal"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                placeholder="Ex: Servidor principal de produção"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api_url">URL da API *</Label>
              <Input
                id="api_url"
                placeholder="https://evolution.example.com"
                value={formData.api_url}
                onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api_key">API Key *</Label>
              <div className="relative">
                <Input
                  id="api_key"
                  type={showApiKey === "form" ? "text" : "password"}
                  placeholder="Chave de acesso à API"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowApiKey(showApiKey === "form" ? null : "form")}
                >
                  {showApiKey === "form" ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Ativo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="is_default"
                  checked={formData.is_default}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                />
                <Label htmlFor="is_default" className="flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  Padrão
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingConnection ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
