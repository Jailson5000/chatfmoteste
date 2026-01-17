import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "./useLawFirm";
import { useEffect } from "react";
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
  const queryClient = useQueryClient();

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

      // Build message query - using is_from_me instead of direction
      let messageQuery = supabase
        .from("messages")
        .select("is_from_me, created_at, conversation_id", { count: "exact" })
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      // Apply attendant filter via conversation
      if (filters.attendantIds.length > 0 || filters.departmentIds.length > 0 || filters.connectionIds.length > 0) {
        // Get conversation IDs that match the filters
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

        const { data: filteredConvs } = await convQuery;
        const convIds = filteredConvs?.map(c => c.id) || [];
        
        if (convIds.length === 0) {
          return { totalReceived: 0, totalSent: 0, totalConversations: 0, activeConversations: 0, avgResponseTime: 0 };
        }
        
        messageQuery = messageQuery.in("conversation_id", convIds);
      }

      const { data: messages, error } = await messageQuery;
      
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

      // Get conversations with their messages
      const { data: conversations } = await supabase
        .from("conversations")
        .select("id, assigned_to")
        .eq("law_firm_id", lawFirm.id)
        .gte("updated_at", startDate.toISOString())
        .lte("updated_at", endDate.toISOString());

      // Get message counts per conversation - using is_from_me
      const { data: messages } = await supabase
        .from("messages")
        .select("conversation_id, is_from_me")
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

      // Get messages in range - using is_from_me
      let messageQuery = supabase
        .from("messages")
        .select("is_from_me, created_at, conversation_id")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      // Apply filters
      if (filters.attendantIds.length > 0 || filters.departmentIds.length > 0 || filters.connectionIds.length > 0) {
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

        const { data: filteredConvs } = await convQuery;
        const convIds = filteredConvs?.map(c => c.id) || [];
        
        if (convIds.length > 0) {
          messageQuery = messageQuery.in("conversation_id", convIds);
        }
      }

      const { data: messages } = await messageQuery;

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

  // Real-time subscription
  useEffect(() => {
    if (!lawFirm?.id) return;

    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        () => {
          // Debounce refetch
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ["dashboard-message-metrics", lawFirm.id] });
            queryClient.invalidateQueries({ queryKey: ["dashboard-attendant-metrics", lawFirm.id] });
            queryClient.invalidateQueries({ queryKey: ["dashboard-time-series", lawFirm.id] });
          }, 1000);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        () => {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ["dashboard-message-metrics", lawFirm.id] });
            queryClient.invalidateQueries({ queryKey: ["dashboard-attendant-metrics", lawFirm.id] });
          }, 1000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lawFirm?.id, queryClient]);

  return {
    messageMetrics: messageMetrics || { totalReceived: 0, totalSent: 0, totalConversations: 0, activeConversations: 0, avgResponseTime: 0 },
    attendantMetrics: attendantMetrics || [],
    timeSeriesData: timeSeriesData || [],
    isLoading: metricsLoading || attendantLoading || timeSeriesLoading,
    refetch: refetchMetrics,
  };
}
