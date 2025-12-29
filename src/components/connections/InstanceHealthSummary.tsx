import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  Wifi,
  WifiOff,
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { subDays, differenceInMinutes, differenceInHours } from "date-fns";
import { cn } from "@/lib/utils";

interface InstanceWithHealth {
  id: string;
  instance_name: string;
  status: string;
  disconnected_since: string | null;
  law_firm_id: string;
}

export function InstanceHealthSummary() {
  // Fetch all instances with their current status
  const { data: instances = [], isLoading: instancesLoading } = useQuery({
    queryKey: ["all-instances-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("id, instance_name, status, disconnected_since, law_firm_id");

      if (error) throw error;
      return data as InstanceWithHealth[];
    },
    staleTime: 30000,
  });

  // Fetch status history for disconnection analysis
  const { data: statusHistory = [] } = useQuery({
    queryKey: ["all-status-history-health"],
    queryFn: async () => {
      const startDate = subDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from("instance_status_history")
        .select("*")
        .gte("changed_at", startDate)
        .order("changed_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  // Calculate health metrics
  const healthMetrics = useMemo(() => {
    const totalInstances = instances.length;
    const connectedInstances = instances.filter((i) => i.status === "connected").length;
    const disconnectedInstances = instances.filter(
      (i) => i.status === "disconnected" || i.status === "error"
    );

    // Calculate average disconnection time
    let totalDisconnectionMinutes = 0;
    let disconnectionCount = 0;

    // Calculate from instances currently disconnected
    disconnectedInstances.forEach((inst) => {
      if (inst.disconnected_since) {
        totalDisconnectionMinutes += differenceInMinutes(
          new Date(),
          new Date(inst.disconnected_since)
        );
        disconnectionCount++;
      }
    });

    // Calculate from historical disconnections
    const disconnectionEvents = statusHistory.filter(
      (h) => h.status === "disconnected" || h.status === "error"
    );

    disconnectionEvents.forEach((event) => {
      // Find the next connected event for this instance
      const reconnectEvent = statusHistory.find(
        (h) =>
          h.instance_id === event.instance_id &&
          h.status === "connected" &&
          new Date(h.changed_at) > new Date(event.changed_at)
      );

      if (reconnectEvent) {
        totalDisconnectionMinutes += differenceInMinutes(
          new Date(reconnectEvent.changed_at),
          new Date(event.changed_at)
        );
        disconnectionCount++;
      }
    });

    const avgDisconnectionMinutes =
      disconnectionCount > 0 ? totalDisconnectionMinutes / disconnectionCount : 0;

    // Calculate uptime percentage
    const uptimePercent =
      totalInstances > 0 ? (connectedInstances / totalInstances) * 100 : 0;

    // Count critical instances (disconnected > 30 min)
    const criticalInstances = disconnectedInstances.filter((inst) => {
      if (!inst.disconnected_since) return false;
      return differenceInMinutes(new Date(), new Date(inst.disconnected_since)) > 30;
    });

    return {
      totalInstances,
      connectedInstances,
      disconnectedCount: disconnectedInstances.length,
      criticalCount: criticalInstances.length,
      uptimePercent,
      avgDisconnectionMinutes,
      disconnectedInstances,
    };
  }, [instances, statusHistory]);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}min`;
    return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  };

  if (instancesLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Resumo de Saúde das Instâncias
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Connected */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wifi className="h-4 w-4 text-green-500" />
              Conectadas
            </div>
            <div className="text-2xl font-bold text-green-600">
              {healthMetrics.connectedInstances}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                / {healthMetrics.totalInstances}
              </span>
            </div>
          </div>

          {/* Disconnected */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <WifiOff className="h-4 w-4 text-destructive" />
              Desconectadas
            </div>
            <div className={cn(
              "text-2xl font-bold",
              healthMetrics.disconnectedCount > 0 ? "text-destructive" : "text-muted-foreground"
            )}>
              {healthMetrics.disconnectedCount}
            </div>
          </div>

          {/* Critical */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Críticas (&gt;30min)
            </div>
            <div className={cn(
              "text-2xl font-bold",
              healthMetrics.criticalCount > 0 ? "text-orange-600" : "text-muted-foreground"
            )}>
              {healthMetrics.criticalCount}
            </div>
          </div>

          {/* Avg Disconnection Time */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Tempo Médio Offline
            </div>
            <div className="text-2xl font-bold">
              {healthMetrics.avgDisconnectionMinutes > 0
                ? formatDuration(healthMetrics.avgDisconnectionMinutes)
                : "—"}
            </div>
          </div>
        </div>

        {/* Uptime Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Uptime Geral</span>
            <span
              className={cn(
                "text-sm font-bold",
                healthMetrics.uptimePercent >= 90
                  ? "text-green-600"
                  : healthMetrics.uptimePercent >= 70
                  ? "text-yellow-600"
                  : "text-destructive"
              )}
            >
              {healthMetrics.uptimePercent.toFixed(1)}%
            </span>
          </div>
          <Progress
            value={healthMetrics.uptimePercent}
            className={cn(
              "h-2",
              healthMetrics.uptimePercent >= 90
                ? "[&>div]:bg-green-500"
                : healthMetrics.uptimePercent >= 70
                ? "[&>div]:bg-yellow-500"
                : "[&>div]:bg-destructive"
            )}
          />
        </div>

        {/* Disconnected Instances List */}
        {healthMetrics.disconnectedInstances.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              Instâncias Desconectadas
            </h4>
            <div className="space-y-2">
              {healthMetrics.disconnectedInstances.map((inst) => {
                const disconnectedMins = inst.disconnected_since
                  ? differenceInMinutes(new Date(), new Date(inst.disconnected_since))
                  : 0;
                const isCritical = disconnectedMins > 30;

                return (
                  <div
                    key={inst.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      isCritical
                        ? "border-destructive/50 bg-destructive/5"
                        : "border-yellow-500/50 bg-yellow-500/5"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <WifiOff
                        className={cn(
                          "h-4 w-4",
                          isCritical ? "text-destructive" : "text-yellow-600"
                        )}
                      />
                      <span className="font-medium">{inst.instance_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          isCritical
                            ? "border-destructive/50 text-destructive"
                            : "border-yellow-500/50 text-yellow-600"
                        )}
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        {formatDuration(disconnectedMins)}
                      </Badge>
                      {isCritical && (
                        <Badge className="bg-destructive/20 text-destructive border-destructive/30">
                          Crítico
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All Good State */}
        {healthMetrics.disconnectedInstances.length === 0 && healthMetrics.totalInstances > 0 && (
          <div className="flex items-center justify-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-green-600 font-medium">
              Todas as instâncias estão conectadas
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
