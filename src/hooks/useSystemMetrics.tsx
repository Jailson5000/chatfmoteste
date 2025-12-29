import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SystemMetric {
  id: string;
  metric_name: string;
  metric_value: number;
  metric_type: string;
  tags: Record<string, unknown>;
  recorded_at: string;
}

interface DashboardMetrics {
  totalCompanies: number;
  activeCompanies: number;
  totalUsers: number;
  totalConnections: number;
  activeConnections: number;
  totalMessages: number;
  totalConversations: number;
  revenue: number;
}

export function useSystemMetrics() {
  const { data: metrics = [], isLoading: metricsLoading } = useQuery({
    queryKey: ["system-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_metrics")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as SystemMetric[];
    },
  });

  const { data: dashboardMetrics, isLoading: dashboardLoading } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: async () => {
      // Fetch all metrics in parallel
      const [
        companiesResult,
        usersResult,
        instancesResult,
        messagesResult,
        conversationsResult,
        plansResult,
      ] = await Promise.all([
        supabase.from("companies").select("id, status", { count: "exact" }),
        supabase.from("profiles").select("id", { count: "exact" }),
        supabase.from("whatsapp_instances").select("id, status", { count: "exact" }),
        supabase.from("messages").select("id", { count: "exact" }),
        supabase.from("conversations").select("id", { count: "exact" }),
        supabase.from("companies").select("plan:plans(price)"),
      ]);

      const activeCompanies = companiesResult.data?.filter(c => c.status === "active").length || 0;
      const activeConnections = instancesResult.data?.filter(i => i.status === "connected").length || 0;

      // Calculate MRR
      let revenue = 0;
      if (plansResult.data) {
        plansResult.data.forEach((company: { plan: { price: number } | null }) => {
          if (company.plan?.price) {
            revenue += company.plan.price;
          }
        });
      }

      return {
        totalCompanies: companiesResult.count || 0,
        activeCompanies,
        totalUsers: usersResult.count || 0,
        totalConnections: instancesResult.count || 0,
        activeConnections,
        totalMessages: messagesResult.count || 0,
        totalConversations: conversationsResult.count || 0,
        revenue,
      } as DashboardMetrics;
    },
  });

  return {
    metrics,
    dashboardMetrics,
    isLoading: metricsLoading || dashboardLoading,
  };
}
