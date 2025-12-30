import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Link2,
  Wifi,
  WifiOff,
  Phone,
  Building2,
  RefreshCw,
  MoreVertical,
  Eye,
  Power,
  PowerOff,
  Activity,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  FileText,
  Filter,
  History,
  Bell,
} from "lucide-react";
import { useGlobalAdminInstances, InstanceWithCompany } from "@/hooks/useGlobalAdminInstances";
import { InstanceUptimeChart } from "@/components/connections/InstanceUptimeChart";
import { InstanceHealthSummary } from "@/components/connections/InstanceHealthSummary";
import { EvolutionApiConnectionsCard } from "@/components/global-admin/EvolutionApiConnectionsCard";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

type StatusFilter = "all" | "problems" | "connected" | "disconnected" | "awaiting_qr" | "suspended";

interface WebhookLog {
  id: string;
  created_at: string;
  direction: string;
  payload: any;
  response: any;
  status_code: number | null;
  error_message: string | null;
}

// Component for webhook logs
function WebhookLogsViewer({ instanceName }: { instanceName: string }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["webhook-logs", instanceName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Filter logs that contain this instance name in the payload
      return (data as WebhookLog[]).filter((log) => {
        const payloadStr = JSON.stringify(log.payload || {});
        return payloadStr.includes(instanceName);
      });
    },
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Nenhum log de webhook encontrado para esta instância</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const eventType = log.payload?.event || log.payload?.data?.event || "unknown";
        const isError = log.error_message || (log.status_code && log.status_code >= 400);

        return (
          <div
            key={log.id}
            className={`p-3 rounded-md border text-sm ${
              isError ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/30"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant={isError ? "destructive" : "secondary"} className="text-xs">
                  {eventType}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {log.direction}
                </Badge>
                {log.status_code && (
                  <span className={`text-xs font-mono ${log.status_code >= 400 ? "text-destructive" : "text-green-600"}`}>
                    {log.status_code}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
              </span>
            </div>
            {log.error_message && (
              <div className="text-xs text-destructive bg-destructive/10 p-2 rounded mt-2">
                {log.error_message}
              </div>
            )}
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Ver payload
              </summary>
              <pre className="text-xs mt-2 p-2 bg-background rounded overflow-auto max-h-32">
                {JSON.stringify(log.payload, null, 2)}
              </pre>
            </details>
          </div>
        );
      })}
    </div>
  );
}

export default function GlobalAdminConnections() {
  const { toast } = useToast();
  const {
    instances,
    isLoading,
    evolutionHealth,
    isHealthLoading,
    refetchHealth,
    refreshInstanceStatus,
    restartInstance,
    suspendInstance,
    reactivateInstance,
    refreshAllStatuses,
  } = useGlobalAdminInstances();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedInstance, setSelectedInstance] = useState<InstanceWithCompany | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Manual alert trigger mutation
  const triggerAlertCheck = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("check-instance-alerts");
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Verificação concluída",
          description: data.message || "Alertas verificados com sucesso",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro na verificação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Apply filters
  const filteredInstances = useMemo(() => {
    return instances.filter((instance) => {
      // Search filter
      const matchesSearch =
        instance.instance_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        instance.phone_number?.includes(searchQuery) ||
        instance.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        instance.law_firm_name?.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Status filter
      switch (statusFilter) {
        case "problems":
          return ["disconnected", "error", "suspended"].includes(instance.status);
        case "connected":
          return instance.status === "connected";
        case "disconnected":
          return instance.status === "disconnected";
        case "awaiting_qr":
          return instance.status === "awaiting_qr" || instance.status === "connecting";
        case "suspended":
          return instance.status === "suspended";
        default:
          return true;
      }
    });
  }, [instances, searchQuery, statusFilter]);

  const problemsCount = instances.filter((i) =>
    ["disconnected", "error", "suspended"].includes(i.status)
  ).length;

  const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    connected: "default",
    connecting: "secondary",
    awaiting_qr: "secondary",
    disconnected: "destructive",
    suspended: "outline",
    error: "destructive",
  };

  const statusLabels: Record<string, string> = {
    connected: "Conectada",
    connecting: "Conectando",
    awaiting_qr: "Aguardando QR",
    disconnected: "Desconectada",
    suspended: "Suspensa",
    error: "Erro",
  };

  const getEvolutionStatusIcon = () => {
    if (isHealthLoading) {
      return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
    }
    switch (evolutionHealth?.status) {
      case "online":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "unstable":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "offline":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Activity className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getEvolutionStatusColor = () => {
    switch (evolutionHealth?.status) {
      case "online":
        return "bg-green-500/10 border-green-500/20 text-green-600";
      case "unstable":
        return "bg-yellow-500/10 border-yellow-500/20 text-yellow-600";
      case "offline":
        return "bg-destructive/10 border-destructive/20 text-destructive";
      default:
        return "bg-muted border-border text-muted-foreground";
    }
  };

  const getEvolutionStatusLabel = () => {
    switch (evolutionHealth?.status) {
      case "online":
        return "Online";
      case "unstable":
        return "Instável";
      case "offline":
        return "Offline";
      default:
        return "Verificando...";
    }
  };

  const handleViewDetails = (instance: InstanceWithCompany) => {
    setSelectedInstance(instance);
    setDetailsOpen(true);
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Conexões WhatsApp</h1>
            <p className="text-muted-foreground">
              Monitore e gerencie todas as instâncias do Evolution API
            </p>
          </div>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => triggerAlertCheck.mutate()}
                  disabled={triggerAlertCheck.isPending}
                >
                  <Bell className={`h-4 w-4 mr-2 ${triggerAlertCheck.isPending ? "animate-pulse" : ""}`} />
                  Verificar Alertas
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Enviar alertas para instâncias desconectadas há mais de 30 minutos</p>
              </TooltipContent>
            </Tooltip>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchHealth()}
              disabled={isHealthLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isHealthLoading ? "animate-spin" : ""}`} />
              Verificar Evolution
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshAllStatuses.mutate()}
              disabled={refreshAllStatuses.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshAllStatuses.isPending ? "animate-spin" : ""}`} />
              Atualizar Todas
            </Button>
          </div>
        </div>

        {/* Evolution Global Status */}
        <Card className={`border-2 ${getEvolutionStatusColor()}`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-background/50">
                  {getEvolutionStatusIcon()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">Evolution API</h3>
                    <Badge variant="outline" className={getEvolutionStatusColor()}>
                      {getEvolutionStatusLabel()}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {evolutionHealth?.message || "Verificando conexão com a API..."}
                  </p>
                </div>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                {evolutionHealth?.latency_ms && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {evolutionHealth.latency_ms}ms
                  </div>
                )}
                {evolutionHealth?.checked_at && (
                  <div>
                    Verificado{" "}
                    {formatDistanceToNow(new Date(evolutionHealth.checked_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Link2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {evolutionHealth?.instances_summary?.total || instances.length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conectadas</CardTitle>
              <Wifi className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {evolutionHealth?.instances_summary?.connected ||
                  instances.filter((i) => i.status === "connected").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conectando</CardTitle>
              <Activity className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {evolutionHealth?.instances_summary?.connecting ||
                  instances.filter((i) => i.status === "connecting" || i.status === "awaiting_qr")
                    .length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Desconectadas</CardTitle>
              <WifiOff className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {evolutionHealth?.instances_summary?.disconnected ||
                  instances.filter((i) => i.status === "disconnected").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Erro</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {evolutionHealth?.instances_summary?.error ||
                  instances.filter((i) => i.status === "error").length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Evolution API Connections */}
        <EvolutionApiConnectionsCard />

        {/* Health Summary & Uptime Chart */}
        <div className="grid gap-6 lg:grid-cols-2">
          <InstanceHealthSummary />
          <InstanceUptimeChart />
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, número, empresa ou escritório..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={statusFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                >
                  Todas
                </Button>
                <Button
                  variant={statusFilter === "problems" ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("problems")}
                  className="gap-1"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Problemas
                  {problemsCount > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                      {problemsCount}
                    </Badge>
                  )}
                </Button>
                <Button
                  variant={statusFilter === "connected" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("connected")}
                >
                  Conectadas
                </Button>
                <Button
                  variant={statusFilter === "disconnected" ? "outline" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("disconnected")}
                  className={statusFilter === "disconnected" ? "border-destructive text-destructive" : ""}
                >
                  Desconectadas
                </Button>
                <Button
                  variant={statusFilter === "awaiting_qr" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("awaiting_qr")}
                >
                  Aguardando QR
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Instâncias do Evolution ({filteredInstances.length})
              {statusFilter !== "all" && (
                <Badge variant="outline" className="ml-2">
                  <Filter className="h-3 w-3 mr-1" />
                  {statusFilter === "problems" ? "Com problemas" : statusLabels[statusFilter] || statusFilter}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Instância</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Último Evento</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInstances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {searchQuery || statusFilter !== "all"
                          ? "Nenhuma instância encontrada para estes filtros"
                          : "Nenhuma instância cadastrada"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInstances.map((instance) => (
                      <TableRow key={instance.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{instance.company_name}</span>
                            </div>
                            {instance.subdomain && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                <Globe className="h-3 w-3" />
                                {instance.subdomain}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-2 w-2 rounded-full ${
                                instance.status === "connected"
                                  ? "bg-green-500"
                                  : instance.status === "connecting" ||
                                    instance.status === "awaiting_qr"
                                  ? "bg-yellow-500"
                                  : "bg-destructive"
                              }`}
                            />
                            <span className="font-medium">{instance.instance_name}</span>
                          </div>
                          {instance.instance_id && (
                            <div className="text-xs text-muted-foreground mt-1 font-mono">
                              {instance.instance_id.slice(0, 12)}...
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            {instance.phone_number || "-"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusColors[instance.status] || "outline"}>
                            {statusLabels[instance.status] || instance.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {instance.last_webhook_event && (
                              <div className="flex items-center gap-1">
                                <Activity className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs font-mono">
                                  {instance.last_webhook_event}
                                </span>
                              </div>
                            )}
                            {instance.last_webhook_at ? (
                              <div className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(instance.last_webhook_at), {
                                  addSuffix: true,
                                  locale: ptBR,
                                })}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(instance.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetails(instance)}>
                                <Eye className="h-4 w-4 mr-2" />
                                Ver Detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => refreshInstanceStatus.mutate(instance.id)}
                                disabled={refreshInstanceStatus.isPending}
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Atualizar Status
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => restartInstance.mutate(instance.id)}
                                disabled={restartInstance.isPending}
                              >
                                <Power className="h-4 w-4 mr-2" />
                                Reiniciar Conexão
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {instance.status === "suspended" ? (
                                <DropdownMenuItem
                                  onClick={() => reactivateInstance.mutate(instance.id)}
                                  disabled={reactivateInstance.isPending}
                                >
                                  <Power className="h-4 w-4 mr-2 text-green-500" />
                                  Reativar Instância
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => suspendInstance.mutate(instance.id)}
                                  disabled={suspendInstance.isPending}
                                  className="text-destructive"
                                >
                                  <PowerOff className="h-4 w-4 mr-2" />
                                  Suspender Instância
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Instance Details Dialog with Tabs */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                {selectedInstance?.instance_name}
              </DialogTitle>
              <DialogDescription>
                Informações completas e histórico de eventos
              </DialogDescription>
            </DialogHeader>
            {selectedInstance && (
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="details" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Detalhes
                  </TabsTrigger>
                  <TabsTrigger value="logs" className="gap-2">
                    <History className="h-4 w-4" />
                    Logs de Webhook
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-4">
                  <ScrollArea className="max-h-[50vh]">
                    <div className="space-y-4">
                      {/* Instance Info */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Empresa</label>
                          <p className="font-medium">{selectedInstance.company_name}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Escritório</label>
                          <p className="font-medium">{selectedInstance.law_firm_name}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Subdomínio</label>
                          <p className="font-medium font-mono">
                            {selectedInstance.subdomain || "-"}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Status</label>
                          <Badge variant={statusColors[selectedInstance.status] || "outline"}>
                            {statusLabels[selectedInstance.status] || selectedInstance.status}
                          </Badge>
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          Dados da Instância
                        </h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Nome da Instância</label>
                            <p className="font-mono">{selectedInstance.instance_name}</p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">ID da Instância</label>
                            <p className="font-mono text-xs">
                              {selectedInstance.instance_id || "-"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Número</label>
                            <p className="font-mono">{selectedInstance.phone_number || "-"}</p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">API URL</label>
                            <p className="font-mono text-xs truncate">{selectedInstance.api_url}</p>
                          </div>
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Atividade
                        </h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Último Evento</label>
                            <p className="font-mono">
                              {selectedInstance.last_webhook_event || "-"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Data do Evento</label>
                            <p>
                              {selectedInstance.last_webhook_at
                                ? new Date(selectedInstance.last_webhook_at).toLocaleString("pt-BR")
                                : "-"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Criada em</label>
                            <p>
                              {new Date(selectedInstance.created_at).toLocaleString("pt-BR")}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Atualizada em</label>
                            <p>
                              {new Date(selectedInstance.updated_at).toLocaleString("pt-BR")}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          IDs de Referência
                        </h4>
                        <div className="grid gap-2 text-xs font-mono bg-muted p-3 rounded-md">
                          <div>
                            <span className="text-muted-foreground">instance_id: </span>
                            {selectedInstance.id}
                          </div>
                          <div>
                            <span className="text-muted-foreground">law_firm_id: </span>
                            {selectedInstance.law_firm_id}
                          </div>
                          {selectedInstance.company_id && (
                            <div>
                              <span className="text-muted-foreground">company_id: </span>
                              {selectedInstance.company_id}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="logs" className="mt-4">
                  <ScrollArea className="max-h-[50vh]">
                    <WebhookLogsViewer instanceName={selectedInstance.instance_name} />
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
