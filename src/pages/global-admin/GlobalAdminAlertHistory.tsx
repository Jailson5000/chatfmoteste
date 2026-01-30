import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "@/components/ui/dialog";
import {
  Bell,
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Mail,
  Eye,
  RefreshCw,
} from "lucide-react";
import { useNotificationLogs, useNotificationStats, NotificationLog } from "@/hooks/useNotificationLogs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const eventTypeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  COMPANY_PROVISIONING_SUCCESS: {
    label: "Provisionamento Sucesso",
    icon: <CheckCircle className="h-4 w-4" />,
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  COMPANY_PROVISIONING_FAILED: {
    label: "Provisionamento Falhou",
    icon: <XCircle className="h-4 w-4" />,
    color: "bg-destructive/10 text-destructive",
  },
  COMPANY_PROVISIONING_PARTIAL: {
    label: "Provisionamento Parcial",
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  INTEGRATION_DOWN: {
    label: "Integração Offline",
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
  INSTANCE_DISCONNECTION_ALERT: {
    label: "Instância Desconectada",
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  INSTANCE_DISCONNECTION_REMINDER: {
    label: "Lembrete (24h+)",
    icon: <Bell className="h-4 w-4" />,
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
};

export default function GlobalAdminAlertHistory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<NotificationLog | null>(null);
  
  const { data: logs = [], isLoading, refetch } = useNotificationLogs(100);
  const { data: stats } = useNotificationStats();

  const filteredLogs = logs.filter(
    (log) =>
      log.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.event_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.email_sent_to.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getEventConfig = (eventType: string) => {
    return (
      eventTypeConfig[eventType] || {
        label: eventType,
        icon: <Bell className="h-4 w-4" />,
        color: "bg-muted text-muted-foreground",
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Histórico de Alertas</h1>
          <p className="text-muted-foreground">
            Visualize todas as notificações enviadas pelo sistema
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Enviados</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">alertas no total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Últimas 24h</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.last24h || 0}</div>
            <p className="text-xs text-muted-foreground">alertas recentes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Últimos 7 dias</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.last7d || 0}</div>
            <p className="text-xs text-muted-foreground">alertas na semana</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Instâncias Offline</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {stats?.byType?.integrationDown || 0}
            </div>
            <p className="text-xs text-muted-foreground">alertas de instâncias</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificações Enviadas
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar alertas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mb-4 opacity-30" />
              <p>Nenhum alerta encontrado</p>
              {searchTerm && (
                <p className="text-sm">Tente ajustar sua busca</p>
              )}
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Enviado Para</TableHead>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const config = getEventConfig(log.event_type);
                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge className={config.color}>
                            <span className="flex items-center gap-1">
                              {config.icon}
                              {config.label}
                            </span>
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {log.company_name || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {log.email_sent_to}
                        </TableCell>
                        <TableCell>
                          {format(new Date(log.sent_at), "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Detalhes do Alerta
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Tipo
                  </label>
                  <div className="mt-1">
                    <Badge className={getEventConfig(selectedLog.event_type).color}>
                      {getEventConfig(selectedLog.event_type).label}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Data/Hora
                  </label>
                  <p className="mt-1">
                    {format(new Date(selectedLog.sent_at), "dd/MM/yyyy 'às' HH:mm:ss", {
                      locale: ptBR,
                    })}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Empresa
                  </label>
                  <p className="mt-1 font-medium">
                    {selectedLog.company_name || "N/A"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Enviado Para
                  </label>
                  <p className="mt-1">{selectedLog.email_sent_to}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Event Key
                </label>
                <p className="mt-1 font-mono text-sm bg-muted p-2 rounded">
                  {selectedLog.event_key}
                </p>
              </div>

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Metadados
                  </label>
                  <ScrollArea className="h-[200px] mt-1">
                    <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
