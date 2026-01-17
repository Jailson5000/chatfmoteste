import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, Globe, MessageSquare, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { DashboardFilters } from "@/hooks/useDashboardMetrics";
import { startOfDay, endOfDay, subDays, startOfMonth } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from "recharts";

const CHART_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

interface ConversationOriginCardProps {
  filters: DashboardFilters;
}

interface OriginData {
  name: string;
  count: number;
  type: "whatsapp" | "site" | "other";
  phoneNumber?: string;
  color: string;
}

export function ConversationOriginCard({ filters }: ConversationOriginCardProps) {
  const { lawFirm } = useLawFirm();

  const getDateRange = () => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = endOfDay(now);

    if (filters.dateFilter === "custom" && filters.customDateRange?.from) {
      startDate = startOfDay(filters.customDateRange.from);
      if (filters.customDateRange.to) {
        endDate = endOfDay(filters.customDateRange.to);
      }
    } else {
      switch (filters.dateFilter) {
        case "today":
          startDate = startOfDay(now);
          break;
        case "7days":
          startDate = subDays(now, 7);
          break;
        case "30days":
          startDate = subDays(now, 30);
          break;
        case "month":
          startDate = startOfMonth(now);
          break;
        default:
          startDate = subDays(now, 365);
      }
    }

    return { startDate, endDate };
  };

  const { data: originData, isLoading } = useQuery({
    queryKey: ["conversation-origin", lawFirm?.id, filters],
    queryFn: async (): Promise<OriginData[]> => {
      if (!lawFirm?.id) return [];

      const { startDate, endDate } = getDateRange();

      // Get all WhatsApp instances for this tenant
      const { data: instances } = await supabase
        .from("whatsapp_instances")
        .select("id, instance_name, display_name, phone_number")
        .eq("law_firm_id", lawFirm.id);

      // Get conversations grouped by origin and whatsapp_instance_id
      let conversationsQuery = supabase
        .from("conversations")
        .select("id, origin, whatsapp_instance_id, created_at")
        .eq("law_firm_id", lawFirm.id)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      // Apply filters
      if (filters.attendantIds.length > 0) {
        conversationsQuery = conversationsQuery.in("assigned_to", filters.attendantIds);
      }
      if (filters.departmentIds.length > 0) {
        conversationsQuery = conversationsQuery.in("department_id", filters.departmentIds);
      }
      if (filters.connectionIds.length > 0) {
        conversationsQuery = conversationsQuery.in("whatsapp_instance_id", filters.connectionIds);
      }

      const { data: conversations } = await conversationsQuery;

      if (!conversations || conversations.length === 0) return [];

      // Group by origin type
      const originMap = new Map<string, { count: number; type: "whatsapp" | "site" | "other"; phoneNumber?: string }>();

      // Count conversations per WhatsApp instance
      const instanceCounts = new Map<string, number>();
      let siteCount = 0;
      let otherCount = 0;

      conversations.forEach((conv) => {
        if (conv.origin === "site" || conv.origin === "website") {
          siteCount++;
        } else if (conv.whatsapp_instance_id) {
          const currentCount = instanceCounts.get(conv.whatsapp_instance_id) || 0;
          instanceCounts.set(conv.whatsapp_instance_id, currentCount + 1);
        } else {
          otherCount++;
        }
      });

      const result: OriginData[] = [];
      let colorIndex = 0;

      // Add WhatsApp instances
      instances?.forEach((instance) => {
        const count = instanceCounts.get(instance.id) || 0;
        if (count > 0) {
          const displayName = instance.display_name || instance.instance_name;
          const phoneDisplay = instance.phone_number 
            ? `(${instance.phone_number.slice(-4)})` 
            : "";
          
          result.push({
            name: `${displayName} ${phoneDisplay}`.trim(),
            count,
            type: "whatsapp",
            phoneNumber: instance.phone_number || undefined,
            color: CHART_COLORS[colorIndex % CHART_COLORS.length],
          });
          colorIndex++;
        }
      });

      // Add site origin
      if (siteCount > 0) {
        result.push({
          name: "Site / Widget",
          count: siteCount,
          type: "site",
          color: CHART_COLORS[colorIndex % CHART_COLORS.length],
        });
        colorIndex++;
      }

      // Add other/unknown origin
      if (otherCount > 0) {
        result.push({
          name: "Outros",
          count: otherCount,
          type: "other",
          color: "#9ca3af",
        });
      }

      // Sort by count descending
      return result.sort((a, b) => b.count - a.count);
    },
    enabled: !!lawFirm?.id,
    staleTime: 30000,
  });

  const totalConversations = useMemo(() => {
    return originData?.reduce((sum, item) => sum + item.count, 0) || 0;
  }, [originData]);

  const getOriginIcon = (type: "whatsapp" | "site" | "other") => {
    switch (type) {
      case "whatsapp":
        return <Phone className="h-4 w-4" />;
      case "site":
        return <Globe className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Origem das conversas
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!originData || originData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Origem das conversas
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-48">
          <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-center text-muted-foreground text-sm">
            Nenhuma conversa no período
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Origem das conversas
          </div>
          <Badge variant="secondary" className="text-xs font-normal">
            {totalConversations} total
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Bar Chart */}
        <div className="h-32 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={originData.slice(0, 5)} 
              layout="vertical"
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis 
                type="category" 
                dataKey="name" 
                hide
                width={0}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [`${value} conversas`, ""]}
                labelFormatter={(label) => label}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {originData.slice(0, 5).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="space-y-2">
          {originData.slice(0, 6).map((item) => {
            const percentage = totalConversations > 0 
              ? ((item.count / totalConversations) * 100).toFixed(1) 
              : "0.0";
            
            return (
              <div 
                key={item.name} 
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="flex items-center gap-1.5 text-muted-foreground truncate">
                    {getOriginIcon(item.type)}
                    <span className="truncate">{item.name}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-medium text-foreground">{item.count}</span>
                  <span className="text-xs text-muted-foreground">({percentage}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
