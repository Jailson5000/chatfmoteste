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
  totalAIConversations: number;
  totalTTSMinutes: number;
  revenue: number;
  // Granular company status metrics
  companiesApproved: number;
  companiesPendingApproval: number;
  companiesInTrial: number;
  companiesTrialExpired: number;
  companiesRejected: number;
  companiesTrialExpiringSoon: number;
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
    queryKey: ["dashboard-metrics-global"],
    queryFn: async () => {
      // Fetch all metrics in parallel using the company_usage_summary view
      // This view is accessible to Global Admins via RLS
      const [
        companiesResult,
        usageSummaryResult,
        plansResult,
        companiesDetailResult,
      ] = await Promise.all([
        supabase.from("companies").select("id, status", { count: "exact" }),
        supabase.from("company_usage_summary").select("*"),
        supabase.from("companies").select("plan:plans!companies_plan_id_fkey(price)"),
        supabase.from("companies").select("id, approval_status, trial_type, trial_ends_at"),
      ]);

      // Calculate totals from usage summary (already aggregated per company)
      const usageData = usageSummaryResult.data || [];
      
      let totalUsers = 0;
      let totalConnections = 0;
      let activeConnections = 0;
      let totalAgents = 0;
      let totalAIConversations = 0;
      let totalTTSMinutes = 0;

      usageData.forEach((company: any) => {
        totalUsers += company.current_users || 0;
        totalConnections += company.current_instances || 0;
        totalAgents += company.current_agents || 0;
        totalAIConversations += company.current_ai_conversations || 0;
        totalTTSMinutes += parseFloat(company.current_tts_minutes) || 0;
      });

      // For active connections, we need to check the whatsapp_instances table
      const [{ data: instancesData }, { data: metaConnectionsData }] = await Promise.all([
        supabase.from("whatsapp_instances").select("id, status"),
        supabase.from("meta_connections").select("id, type, is_active").eq("type", "whatsapp_cloud"),
      ]);
      
      activeConnections = instancesData?.filter(i => i.status === "connected").length || 0;

      // Count WhatsApp Cloud API connections (only whatsapp_cloud, not instagram/facebook)
      const totalMetaConnections = metaConnectionsData?.length || 0;
      const activeMetaConnections = metaConnectionsData?.filter(c => c.is_active).length || 0;
      totalConnections += totalMetaConnections;
      activeConnections += activeMetaConnections;

      // For messages and conversations, query directly
      const [messagesResult, conversationsResult, archiveResult] = await Promise.all([
        supabase.from("messages").select("id", { count: "exact", head: true }),
        supabase.from("conversations").select("id", { count: "exact", head: true }),
        supabase.from("messages_archive").select("id", { count: "exact", head: true }),
      ]);

      const activeCompanies = companiesResult.data?.filter(c => c.status === "active").length || 0;

      // Calculate granular company status metrics
      const now = new Date();
      let companiesApproved = 0;
      let companiesPendingApproval = 0;
      let companiesInTrial = 0;
      let companiesTrialExpired = 0;
      let companiesRejected = 0;
      let companiesTrialExpiringSoon = 0;

      companiesDetailResult.data?.forEach((company: any) => {
        if (company.approval_status === 'pending_approval') {
          companiesPendingApproval++;
        } else if (company.approval_status === 'rejected') {
          companiesRejected++;
        } else if (company.trial_type && company.trial_type !== 'none' && company.trial_ends_at) {
          const trialEndsAt = new Date(company.trial_ends_at);
          const daysRemaining = Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysRemaining > 0) {
            companiesInTrial++;
            // Count trials expiring in 2 days or less
            if (daysRemaining <= 2) {
              companiesTrialExpiringSoon++;
            }
          } else {
            companiesTrialExpired++;
          }
        } else if (company.approval_status === 'approved') {
          companiesApproved++;
        }
      });

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
        totalUsers,
        totalConnections,
        activeConnections,
        totalMessages: (messagesResult.count || 0) + ((archiveResult as any).count || 0),
        totalConversations: conversationsResult.count || 0,
        totalAIConversations,
        totalTTSMinutes: Math.round(totalTTSMinutes * 100) / 100,
        revenue,
        // Granular company status metrics
        companiesApproved,
        companiesPendingApproval,
        companiesInTrial,
        companiesTrialExpired,
        companiesRejected,
        companiesTrialExpiringSoon,
      } as DashboardMetrics;
    },
  });

  const { data: growthData = [], isLoading: growthLoading } = useQuery({
    queryKey: ["growth-chart-data"],
    queryFn: async () => {
      const [companiesRes, instancesRes, metaRes] = await Promise.all([
        supabase.from("companies").select("id, created_at"),
        supabase.from("whatsapp_instances").select("id, created_at"),
        supabase.from("meta_connections").select("id, created_at").eq("type", "whatsapp_cloud"),
      ]);

      const companies = companiesRes.data || [];
      const instances = instancesRes.data || [];
      const metaConnections = metaRes.data || [];

      // Helper: "YYYY-MM" key from date string
      const toMonthKey = (dateStr: string) => dateStr.slice(0, 7);

      // Collect all unique months
      const monthSet = new Set<string>();
      companies.forEach(c => monthSet.add(toMonthKey(c.created_at)));
      instances.forEach(i => monthSet.add(toMonthKey(i.created_at)));
      metaConnections.forEach(m => monthSet.add(toMonthKey(m.created_at)));

      const sortedMonths = Array.from(monthSet).sort();
      if (sortedMonths.length === 0) return [];

      // Count per month
      const companyPerMonth: Record<string, number> = {};
      const connectionPerMonth: Record<string, number> = {};
      companies.forEach(c => {
        const k = toMonthKey(c.created_at);
        companyPerMonth[k] = (companyPerMonth[k] || 0) + 1;
      });
      [...instances, ...metaConnections].forEach(i => {
        const k = toMonthKey(i.created_at);
        connectionPerMonth[k] = (connectionPerMonth[k] || 0) + 1;
      });

      // Build cumulative
      const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      let cumCompanies = 0;
      let cumConnections = 0;

      return sortedMonths.map(key => {
        cumCompanies += companyPerMonth[key] || 0;
        cumConnections += connectionPerMonth[key] || 0;
        const [year, month] = key.split("-");
        const label = `${monthNames[parseInt(month, 10) - 1]}/${year.slice(2)}`;
        return { name: label, empresas: cumCompanies, conexoes: cumConnections };
      });
    },
  });

  return {
    metrics,
    dashboardMetrics,
    growthData,
    isLoading: metricsLoading || dashboardLoading || growthLoading,
  };
}
