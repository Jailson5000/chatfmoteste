import { useState } from "react";
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
import { Search, Link2, Wifi, WifiOff, Phone, Building2 } from "lucide-react";
import { useWhatsAppInstances } from "@/hooks/useWhatsAppInstances";

export default function GlobalAdminConnections() {
  const { instances, isLoading } = useWhatsAppInstances();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredInstances = instances.filter(
    (instance) =>
      instance.instance_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      instance.phone_number?.includes(searchQuery)
  );

  const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    connected: "default",
    connecting: "secondary",
    disconnected: "destructive",
    error: "destructive",
  };

  const statusLabels: Record<string, string> = {
    connected: "Conectado",
    connecting: "Conectando",
    disconnected: "Desconectado",
    error: "Erro",
  };

  const connectedCount = instances.filter((i) => i.status === "connected").length;
  const disconnectedCount = instances.filter((i) => i.status !== "connected").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Conexões WhatsApp</h1>
        <p className="text-muted-foreground">
          Monitore todas as conexões WhatsApp do sistema
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Link2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{instances.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conectadas</CardTitle>
            <Wifi className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{connectedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Desconectadas</CardTitle>
            <WifiOff className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{disconnectedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou número..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Todas as Conexões
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instância</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>API URL</TableHead>
                  <TableHead>Último Webhook</TableHead>
                  <TableHead>Criada em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInstances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhuma conexão encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInstances.map((instance) => (
                    <TableRow key={instance.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${instance.status === "connected" ? "bg-green-500" : "bg-destructive"}`} />
                          <span className="font-medium">{instance.instance_name}</span>
                        </div>
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
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {instance.api_url}
                      </TableCell>
                      <TableCell>
                        {instance.last_webhook_at
                          ? new Date(instance.last_webhook_at).toLocaleString("pt-BR")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {new Date(instance.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
