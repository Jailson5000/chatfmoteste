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
      const { data: instancesData } = await supabase
        .from("whatsapp_instances")
        .select("id, status");
      
      activeConnections = instancesData?.filter(i => i.status === "connected").length || 0;

      // For messages and conversations, query directly
      const [messagesResult, conversationsResult] = await Promise.all([
        supabase.from("messages").select("id", { count: "exact", head: true }),
        supabase.from("conversations").select("id", { count: "exact", head: true }),
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
        totalMessages: messagesResult.count || 0,
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

  return {
    metrics,
    dashboardMetrics,
    isLoading: metricsLoading || dashboardLoading,
  };
}
