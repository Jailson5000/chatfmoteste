import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Loader2, Activity, TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, subDays, eachHourOfInterval, startOfHour } from "date-fns";
import { ptBR } from "date-fns/locale";

interface StatusHistoryEntry {
  id: string;
  instance_id: string;
  status: string;
  previous_status: string | null;
  changed_at: string;
}

interface UptimeDataPoint {
  time: string;
  timestamp: Date;
  connected: number;
  disconnected: number;
  total: number;
  uptimePercent: number;
}

interface InstanceUptimeChartProps {
  instanceId?: string;
}

type PeriodOption = "1" | "7" | "30";

export function InstanceUptimeChart({ instanceId }: InstanceUptimeChartProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>("7");
  const days = parseInt(selectedPeriod);
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["instance-status-history", instanceId, days],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      
      let query = supabase
        .from("instance_status_history")
        .select("*")
        .gte("changed_at", startDate)
        .order("changed_at", { ascending: true });

      if (instanceId) {
        query = query.eq("instance_id", instanceId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as StatusHistoryEntry[];
    },
    staleTime: 60000,
  });

  const { data: currentInstances = [] } = useQuery({
    queryKey: ["current-instances-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("id, status");

      if (error) throw error;
      return data;
    },
    staleTime: 30000,
  });

  const chartData = useMemo(() => {
    if (currentInstances.length === 0) return [];

    const now = new Date();
    const startDate = subDays(now, days);
    const hours = eachHourOfInterval({ start: startDate, end: now });

    // Build a map of instance status at each point in time
    const instanceStatusMap = new Map<string, string>();
    
    // Initialize with current status
    currentInstances.forEach((instance) => {
      instanceStatusMap.set(instance.id, instance.status);
    });

    // Process history in reverse to build timeline
    const sortedHistory = [...history].sort(
      (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
    );

    return hours.map((hour) => {
      const hourStart = startOfHour(hour);
      
      // For each instance, determine status at this hour
      const statusCounts = { connected: 0, disconnected: 0, other: 0 };
      
      currentInstances.forEach((instance) => {
        // Find the status at this point in time
        const relevantChange = sortedHistory.find(
          (h) =>
            h.instance_id === instance.id &&
            new Date(h.changed_at) <= hourStart
        );

        let status = instance.status; // Default to current
        if (relevantChange) {
          status = relevantChange.status;
        }

        if (status === "connected") {
          statusCounts.connected++;
        } else if (["disconnected", "error", "suspended"].includes(status)) {
          statusCounts.disconnected++;
        } else {
          statusCounts.other++;
        }
      });

      const total = currentInstances.length;
      const uptimePercent = total > 0 ? (statusCounts.connected / total) * 100 : 0;

      return {
        time: format(hour, "dd/MM HH:mm", { locale: ptBR }),
        timestamp: hour,
        connected: statusCounts.connected,
        disconnected: statusCounts.disconnected + statusCounts.other,
        total,
        uptimePercent: Math.round(uptimePercent * 10) / 10,
      };
    });
  }, [history, currentInstances, days]);

  const averageUptime = useMemo(() => {
    if (chartData.length === 0) return 0;
    const sum = chartData.reduce((acc, point) => acc + point.uptimePercent, 0);
    return Math.round((sum / chartData.length) * 10) / 10;
  }, [chartData]);

  const currentUptime = useMemo(() => {
    if (currentInstances.length === 0) return 0;
    const connected = currentInstances.filter((i) => i.status === "connected").length;
    return Math.round((connected / currentInstances.length) * 1000) / 10;
  }, [currentInstances]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Uptime das Instâncias
          </CardTitle>
          <div className="flex items-center gap-4">
            <ToggleGroup
              type="single"
              value={selectedPeriod}
              onValueChange={(value) => value && setSelectedPeriod(value as PeriodOption)}
              className="border rounded-lg"
            >
              <ToggleGroupItem value="1" aria-label="Últimas 24h" className="text-xs px-3">
                24h
              </ToggleGroupItem>
              <ToggleGroupItem value="7" aria-label="Últimos 7 dias" className="text-xs px-3">
                7 dias
              </ToggleGroupItem>
              <ToggleGroupItem value="30" aria-label="Últimos 30 dias" className="text-xs px-3">
                30 dias
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Uptime Atual</div>
              <div
                className={`text-lg font-bold ${
                  currentUptime >= 90
                    ? "text-green-600"
                    : currentUptime >= 70
                    ? "text-yellow-600"
                    : "text-destructive"
                }`}
              >
                {currentUptime}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Média Período</div>
              <div
                className={`text-lg font-bold ${
                  averageUptime >= 90
                    ? "text-green-600"
                    : averageUptime >= 70
                    ? "text-yellow-600"
                    : "text-destructive"
                }`}
              >
                {averageUptime}%
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Activity className="h-12 w-12 mb-4 opacity-30" />
            <p>Sem dados de histórico disponíveis</p>
            <p className="text-sm">O histórico será gerado conforme as instâncias mudam de status</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorConnected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorDisconnected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload as UptimeDataPoint;
                  return (
                    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                      <div className="font-medium mb-2">{label}</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <span>Conectadas: {data.connected}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-destructive" />
                          <span>Desconectadas: {data.disconnected}</span>
                        </div>
                        <div className="border-t pt-1 mt-1">
                          <span className="font-medium">
                            Uptime: {data.uptimePercent}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: 10 }}
                formatter={(value) =>
                  value === "connected" ? "Conectadas" : "Desconectadas"
                }
              />
              <Area
                type="monotone"
                dataKey="connected"
                stackId="1"
                stroke="#22c55e"
                fill="url(#colorConnected)"
                name="connected"
              />
              <Area
                type="monotone"
                dataKey="disconnected"
                stackId="1"
                stroke="#ef4444"
                fill="url(#colorDisconnected)"
                name="disconnected"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
