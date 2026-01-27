import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "./useLawFirm";
import { startOfDay, endOfDay, subDays, startOfMonth, parseISO, format } from "date-fns";
import { DateRange } from "react-day-picker";

export type DateFilter = "today" | "7days" | "30days" | "month" | "all" | "custom";

export interface DashboardFilters {
  dateFilter: DateFilter;
  customDateRange?: DateRange;
  attendantIds: string[];
  departmentIds: string[];
  statusIds: string[];
  connectionIds: string[];
}

export interface MessageMetrics {
  totalReceived: number;
  totalSent: number;
  totalConversations: number;
  activeConversations: number;
  avgResponseTime: number;
}

export interface AttendantMetrics {
  id: string;
  name: string;
  avatarUrl: string | null;
  conversationsHandled: number;
  messagesSent: number;
  messagesReceived: number;
  avgResponseTime: number;
}

export interface TimeSeriesData {
  date: string;
  label: string;
  received: number;
  sent: number;
  conversations: number;
}

export function useDashboardMetrics(filters: DashboardFilters) {
  const { lawFirm } = useLawFirm();

  // Calculate date range
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
          startDate = subDays(now, 365); // Default to last year for "all"
      }
    }

    return { startDate, endDate };
  };

  // Fetch message metrics
  const { data: messageMetrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ["dashboard-message-metrics", lawFirm?.id, filters],
    queryFn: async (): Promise<MessageMetrics> => {
      if (!lawFirm?.id) {
        return { totalReceived: 0, totalSent: 0, totalConversations: 0, activeConversations: 0, avgResponseTime: 0 };
      }

      const { startDate, endDate } = getDateRange();

      // CRITICAL: First get conversation IDs for this law_firm only (tenant isolation)
      let convQuery = supabase
        .from("conversations")
        .select("id")
        .eq("law_firm_id", lawFirm.id);

      // Apply additional filters
      if (filters.attendantIds.length > 0) {
        convQuery = convQuery.in("assigned_to", filters.attendantIds);
      }
      if (filters.departmentIds.length > 0) {
        convQuery = convQuery.in("department_id", filters.departmentIds);
      }
      if (filters.connectionIds.length > 0) {
        convQuery = convQuery.in("whatsapp_instance_id", filters.connectionIds);
      }

      const { data: lawFirmConvs } = await convQuery;
      const convIds = lawFirmConvs?.map(c => c.id) || [];
      
      // If no conversations for this law_firm, return zeros
      if (convIds.length === 0) {
        // Get active conversations count (should also be 0 but check anyway)
        const { count: activeCount } = await supabase
          .from("conversations")
          .select("id", { count: "exact" })
          .eq("law_firm_id", lawFirm.id)
          .is("archived_at", null);
          
        return { 
          totalReceived: 0, 
          totalSent: 0, 
          totalConversations: 0, 
          activeConversations: activeCount || 0, 
          avgResponseTime: 0 
        };
      }

      // Build message query - ONLY for conversations belonging to this law_firm
      const { data: messages, error } = await supabase
        .from("messages")
        .select("is_from_me, created_at, conversation_id")
        .in("conversation_id", convIds)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());
      
      if (error) {
        console.error("[useDashboardMetrics] Error fetching messages:", error);
        return { totalReceived: 0, totalSent: 0, totalConversations: 0, activeConversations: 0, avgResponseTime: 0 };
      }

      // is_from_me: true = sent, false = received
      const received = messages?.filter(m => m.is_from_me === false).length || 0;
      const sent = messages?.filter(m => m.is_from_me === true).length || 0;
      const uniqueConversations = new Set(messages?.map(m => m.conversation_id) || []).size;

      // Get active conversations count
      let activeQuery = supabase
        .from("conversations")
        .select("id", { count: "exact" })
        .eq("law_firm_id", lawFirm.id)
        .is("archived_at", null);

      if (filters.attendantIds.length > 0) {
        activeQuery = activeQuery.in("assigned_to", filters.attendantIds);
      }
      if (filters.departmentIds.length > 0) {
        activeQuery = activeQuery.in("department_id", filters.departmentIds);
      }

      const { count: activeCount } = await activeQuery;

      return {
        totalReceived: received,
        totalSent: sent,
        totalConversations: uniqueConversations,
        activeConversations: activeCount || 0,
        avgResponseTime: 0, // TODO: Calculate real response time
      };
    },
    enabled: !!lawFirm?.id,
    staleTime: 30000,
  });

  // Fetch attendant metrics
  const { data: attendantMetrics, isLoading: attendantLoading } = useQuery({
    queryKey: ["dashboard-attendant-metrics", lawFirm?.id, filters],
    queryFn: async (): Promise<AttendantMetrics[]> => {
      if (!lawFirm?.id) return [];

      const { startDate, endDate } = getDateRange();

      // Get all team members
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("law_firm_id", lawFirm.id);

      if (!profiles || profiles.length === 0) return [];

      // Get conversations with their messages - already tenant-filtered
      const { data: conversations } = await supabase
        .from("conversations")
        .select("id, assigned_to")
        .eq("law_firm_id", lawFirm.id)
        .gte("updated_at", startDate.toISOString())
        .lte("updated_at", endDate.toISOString());

      // CRITICAL: Get conversation IDs first to filter messages by tenant
      const lawFirmConvIds = conversations?.map(c => c.id) || [];
      
      // If no conversations, return empty metrics for all profiles
      if (lawFirmConvIds.length === 0) {
        return profiles.map(profile => ({
          id: profile.id,
          name: profile.full_name || "Sem nome",
          avatarUrl: profile.avatar_url,
          conversationsHandled: 0,
          messagesSent: 0,
          messagesReceived: 0,
          avgResponseTime: 0,
        })).sort((a, b) => b.conversationsHandled - a.conversationsHandled);
      }

      // Get message counts ONLY for conversations belonging to this law_firm
      const { data: messages } = await supabase
        .from("messages")
        .select("conversation_id, is_from_me")
        .in("conversation_id", lawFirmConvIds)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      // Build attendant metrics
      const metricsMap = new Map<string, AttendantMetrics>();

      for (const profile of profiles) {
        const assignedConvs = conversations?.filter(c => c.assigned_to === profile.id) || [];
        const convIds = new Set(assignedConvs.map(c => c.id));
        
        const relatedMessages = messages?.filter(m => convIds.has(m.conversation_id)) || [];
        const received = relatedMessages.filter(m => m.is_from_me === false).length;
        const sent = relatedMessages.filter(m => m.is_from_me === true).length;

        metricsMap.set(profile.id, {
          id: profile.id,
          name: profile.full_name || "Sem nome",
          avatarUrl: profile.avatar_url,
          conversationsHandled: assignedConvs.length,
          messagesSent: sent,
          messagesReceived: received,
          avgResponseTime: 0,
        });
      }

      // Sort by conversations handled
      return Array.from(metricsMap.values())
        .sort((a, b) => b.conversationsHandled - a.conversationsHandled);
    },
    enabled: !!lawFirm?.id,
    staleTime: 30000,
  });

  // Fetch time series data
  const { data: timeSeriesData, isLoading: timeSeriesLoading } = useQuery({
    queryKey: ["dashboard-time-series", lawFirm?.id, filters],
    queryFn: async (): Promise<TimeSeriesData[]> => {
      if (!lawFirm?.id) return [];

      const { startDate, endDate } = getDateRange();
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const maxDays = Math.min(days, 60);

      // Generate date buckets
      const buckets: { start: Date; end: Date; label: string }[] = [];
      for (let i = 0; i < maxDays; i++) {
        const day = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        buckets.push({
          start: startOfDay(day),
          end: endOfDay(day),
          label: format(day, "dd/MM"),
        });
      }

      // CRITICAL: First get conversation IDs for this law_firm only (tenant isolation)
      let convQuery = supabase
        .from("conversations")
        .select("id")
        .eq("law_firm_id", lawFirm.id);

      if (filters.attendantIds.length > 0) {
        convQuery = convQuery.in("assigned_to", filters.attendantIds);
      }
      if (filters.departmentIds.length > 0) {
        convQuery = convQuery.in("department_id", filters.departmentIds);
      }
      if (filters.connectionIds.length > 0) {
        convQuery = convQuery.in("whatsapp_instance_id", filters.connectionIds);
      }

      const { data: lawFirmConvs } = await convQuery;
      const convIds = lawFirmConvs?.map(c => c.id) || [];
      
      // If no conversations, return empty buckets
      if (convIds.length === 0) {
        return buckets.map(bucket => ({
          date: bucket.label,
          label: bucket.label,
          received: 0,
          sent: 0,
          conversations: 0,
        }));
      }

      // Get messages ONLY for conversations belonging to this law_firm
      const { data: messages } = await supabase
        .from("messages")
        .select("is_from_me, created_at, conversation_id")
        .in("conversation_id", convIds)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      // Aggregate by bucket
      return buckets.map(bucket => {
        const bucketMessages = messages?.filter(m => {
          const msgDate = parseISO(m.created_at);
          return msgDate >= bucket.start && msgDate <= bucket.end;
        }) || [];

        return {
          date: bucket.label,
          label: bucket.label,
          received: bucketMessages.filter(m => m.is_from_me === false).length,
          sent: bucketMessages.filter(m => m.is_from_me === true).length,
          conversations: new Set(bucketMessages.map(m => m.conversation_id)).size,
        };
      });
    },
    enabled: !!lawFirm?.id,
    staleTime: 30000,
  });

  // Real-time subscription removed - now handled by centralized useRealtimeSync

  return {
    messageMetrics: messageMetrics || { totalReceived: 0, totalSent: 0, totalConversations: 0, activeConversations: 0, avgResponseTime: 0 },
    attendantMetrics: attendantMetrics || [],
    timeSeriesData: timeSeriesData || [],
    isLoading: metricsLoading || attendantLoading || timeSeriesLoading,
    refetch: refetchMetrics,
  };
}
