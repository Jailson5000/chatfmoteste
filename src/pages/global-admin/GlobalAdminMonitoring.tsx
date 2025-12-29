import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Activity, 
  Server, 
  Database, 
  Cpu, 
  HardDrive,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle
} from "lucide-react";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Mock data for system health
const systemHealth = {
  api: { status: "healthy", latency: "45ms" },
  database: { status: "healthy", connections: 12 },
  whatsapp: { status: "healthy", activeInstances: 8 },
  n8n: { status: "warning", workflows: 5 },
};

const performanceData = [
  { time: "00:00", cpu: 25, memory: 45, requests: 120 },
  { time: "04:00", cpu: 20, memory: 42, requests: 80 },
  { time: "08:00", cpu: 45, memory: 55, requests: 350 },
  { time: "12:00", cpu: 65, memory: 68, requests: 520 },
  { time: "16:00", cpu: 55, memory: 62, requests: 480 },
  { time: "20:00", cpu: 35, memory: 50, requests: 280 },
];

const statusIcons = {
  healthy: <CheckCircle className="h-4 w-4 text-green-500" />,
  warning: <AlertCircle className="h-4 w-4 text-yellow-500" />,
  error: <XCircle className="h-4 w-4 text-destructive" />,
};

const actionLabels: Record<string, string> = {
  create: "Criou",
  update: "Atualizou",
  delete: "Excluiu",
  login: "Login",
  logout: "Logout",
};

export default function GlobalAdminMonitoring() {
  const { dashboardMetrics, isLoading: metricsLoading } = useSystemMetrics();
  const { logs, isLoading: logsLoading } = useAuditLogs(20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Monitoramento</h1>
        <p className="text-muted-foreground">
          Acompanhe a saúde e performance do sistema em tempo real
        </p>
      </div>

      {/* System Health */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {statusIcons[systemHealth.api.status as keyof typeof statusIcons]}
              <span className="text-sm font-medium capitalize">{systemHealth.api.status}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Latência: {systemHealth.api.latency}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {statusIcons[systemHealth.database.status as keyof typeof statusIcons]}
              <span className="text-sm font-medium capitalize">{systemHealth.database.status}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {systemHealth.database.connections} conexões ativas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">WhatsApp</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {statusIcons[systemHealth.whatsapp.status as keyof typeof statusIcons]}
              <span className="text-sm font-medium capitalize">{systemHealth.whatsapp.status}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {systemHealth.whatsapp.activeInstances} instâncias ativas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">N8N</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {statusIcons[systemHealth.n8n.status as keyof typeof statusIcons]}
              <span className="text-sm font-medium capitalize">{systemHealth.n8n.status}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {systemHealth.n8n.workflows} workflows ativos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Performance (Últimas 24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="time" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--card))", 
                  borderColor: "hsl(var(--border))",
                  borderRadius: "8px"
                }} 
              />
              <Line 
                type="monotone" 
                dataKey="cpu" 
                name="CPU %" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="memory" 
                name="Memória %" 
                stroke="hsl(var(--chart-2))" 
                strokeWidth={2}
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="requests" 
                name="Requisições" 
                stroke="hsl(var(--chart-3))" 
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Audit Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Logs de Auditoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum log de auditoria encontrado
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ação</TableHead>
                    <TableHead>Entidade</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Data/Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant="outline">
                          {actionLabels[log.action] || log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.entity_type}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {log.ip_address || "-"}
                      </TableCell>
                      <TableCell>
                        {new Date(log.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
