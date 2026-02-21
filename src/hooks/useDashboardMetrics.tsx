import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "./useLawFirm";
import { startOfDay, endOfDay, subDays, startOfMonth, format } from "date-fns";
import { DateRange } from "react-day-picker";
import { formatDateForDatabase } from "@/lib/dateUtils";

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
  archivedConversations: number;
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

// Helper to chunk an array into smaller arrays
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Helper to count messages in chunks to avoid URL length limits
async function countMessagesInChunks(
  convIds: string[],
  isFromMe: boolean,
  startDate: string,
  endDate: string
): Promise<number> {
  if (convIds.length === 0) return 0;
  
  const chunks = chunkArray(convIds, 500);
  let total = 0;
  
  for (const chunk of chunks) {
    const { count } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .in("conversation_id", chunk)
      .eq("is_from_me", isFromMe)
      .gte("created_at", startDate)
      .lte("created_at", endDate);
    total += count || 0;
  }
  
  return total;
}

// Helper to get conversation IDs with filters applied
async function getFilteredConvIds(
  lawFirmId: string,
  filters: DashboardFilters
): Promise<string[]> {
  let convQuery = supabase
    .from("conversations")
    .select("id")
    .eq("law_firm_id", lawFirmId);

  if (filters.attendantIds.length > 0) {
    convQuery = convQuery.in("assigned_to", filters.attendantIds);
  }
  if (filters.departmentIds.length > 0) {
    convQuery = convQuery.in("department_id", filters.departmentIds);
  }
  if (filters.connectionIds.length > 0) {
    convQuery = convQuery.in("whatsapp_instance_id", filters.connectionIds);
  }

  const { data } = await convQuery.limit(10000);
  return data?.map(c => c.id) || [];
}

// Helper to apply common filters to a conversation query
function applyConvFilters(
  query: any,
  filters: DashboardFilters
) {
  if (filters.attendantIds.length > 0) {
    query = query.in("assigned_to", filters.attendantIds);
  }
  if (filters.departmentIds.length > 0) {
    query = query.in("department_id", filters.departmentIds);
  }
  if (filters.connectionIds.length > 0) {
    query = query.in("whatsapp_instance_id", filters.connectionIds);
  }
  return query;
}

function getDateRange(filters: DashboardFilters) {
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
        startDate = startOfDay(subDays(now, 7));
        break;
      case "30days":
        startDate = startOfDay(subDays(now, 30));
        break;
      case "month":
        startDate = startOfMonth(now);
        break;
      default:
        startDate = startOfDay(subDays(now, 365));
    }
  }

  return { startDate, endDate };
}

export function useDashboardMetrics(filters: DashboardFilters) {
  const { lawFirm } = useLawFirm();

  // Fetch message metrics
  const { data: messageMetrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ["dashboard-message-metrics", lawFirm?.id, filters],
    queryFn: async (): Promise<MessageMetrics> => {
      if (!lawFirm?.id) {
        return { totalReceived: 0, totalSent: 0, totalConversations: 0, activeConversations: 0, archivedConversations: 0, avgResponseTime: 0 };
      }

      const { startDate, endDate } = getDateRange(filters);
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();
      const today = formatDateForDatabase(new Date());

      const hasFilters = filters.attendantIds.length > 0 || filters.departmentIds.length > 0 || filters.connectionIds.length > 0;

      // --- Strategy: use snapshots for past days, real-time for today ---
      let totalReceived = 0;
      let totalSent = 0;
      let totalConversationsFromSnapshots = 0;

      const snapshotStartDate = formatDateForDatabase(startDate);
      const snapshotEndDate = formatDateForDatabase(endDate);

      // Only use snapshots if no advanced filters are applied (snapshots don't have per-attendant/dept/connection breakdown)
      if (!hasFilters) {
        // Fetch snapshots for past days (excluding today)
        const { data: snapshots } = await supabase
          .from("dashboard_daily_snapshots")
          .select("snapshot_date, messages_received, messages_sent, conversations_active")
          .eq("law_firm_id", lawFirm.id)
          .gte("snapshot_date", snapshotStartDate)
          .lt("snapshot_date", today);

        const snapshotDates = new Set(snapshots?.map(s => s.snapshot_date) || []);

        if (snapshots && snapshots.length > 0) {
          for (const s of snapshots) {
            totalReceived += s.messages_received;
            totalSent += s.messages_sent;
            totalConversationsFromSnapshots += s.conversations_active;
          }
        }

        // Calculate real-time for today + any days without snapshots
        const convIds = await getFilteredConvIds(lawFirm.id, filters);

        if (convIds.length > 0) {
          // Count today's messages
          const todayStart = startOfDay(new Date()).toISOString();
          const todayEnd = endOfDay(new Date()).toISOString();

          // Only count today if it's within the date range
          if (today >= snapshotStartDate && today <= snapshotEndDate) {
            const [todayReceived, todaySent] = await Promise.all([
              countMessagesInChunks(convIds, false, todayStart, todayEnd),
              countMessagesInChunks(convIds, true, todayStart, todayEnd),
            ]);
            totalReceived += todayReceived;
            totalSent += todaySent;
          }

          // Count messages for days without snapshots (fallback)
          // Generate list of past days in range
          const pastDaysWithoutSnapshot: { start: string; end: string }[] = [];
          const d = new Date(startDate);
          const todayDate = new Date();
          while (d < todayDate) {
            const dateStr = formatDateForDatabase(d);
            if (dateStr !== today && !snapshotDates.has(dateStr)) {
              pastDaysWithoutSnapshot.push({
                start: startOfDay(new Date(d)).toISOString(),
                end: endOfDay(new Date(d)).toISOString(),
              });
            }
            d.setDate(d.getDate() + 1);
          }

          // Count fallback days
          for (const day of pastDaysWithoutSnapshot) {
            const [r, s] = await Promise.all([
              countMessagesInChunks(convIds, false, day.start, day.end),
              countMessagesInChunks(convIds, true, day.start, day.end),
            ]);
            totalReceived += r;
            totalSent += s;
          }
        }
      } else {
        // With filters: can't use snapshots, calculate everything in real-time
        const convIds = await getFilteredConvIds(lawFirm.id, filters);

        if (convIds.length > 0) {
          const [received, sent] = await Promise.all([
            countMessagesInChunks(convIds, false, startISO, endISO),
            countMessagesInChunks(convIds, true, startISO, endISO),
          ]);
          totalReceived = received;
          totalSent = sent;
        }
      }

      // Count total conversations with activity in the period
      let totalConvQuery = supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("law_firm_id", lawFirm.id)
        .gte("last_message_at", startISO)
        .lte("last_message_at", endISO);
      totalConvQuery = applyConvFilters(totalConvQuery, filters);
      const { count: totalConversationsCount } = await totalConvQuery;

      // Get active conversations count (with ALL filters including connectionIds)
      let activeQuery = supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("law_firm_id", lawFirm.id)
        .is("archived_at", null);
      activeQuery = applyConvFilters(activeQuery, filters);
      const { count: activeCount } = await activeQuery;

      // Get archived conversations count (with ALL filters including connectionIds)
      let archivedQuery = supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("law_firm_id", lawFirm.id)
        .not("archived_at", "is", null);
      archivedQuery = applyConvFilters(archivedQuery, filters);
      const { count: archivedCount } = await archivedQuery;

      // Avg response time - sample from today only to keep it fast
      let avgResponseTime = 0;
      const convIds = await getFilteredConvIds(lawFirm.id, filters);

      if (convIds.length > 0) {
        const sampleChunks = chunkArray(convIds.slice(0, 2000), 500);
        let allMessages: { is_from_me: boolean; created_at: string; conversation_id: string }[] = [];
        
        for (const chunk of sampleChunks) {
          const { data: msgs } = await supabase
            .from("messages")
            .select("is_from_me, created_at, conversation_id")
            .in("conversation_id", chunk)
            .gte("created_at", startISO)
            .lte("created_at", endISO)
            .order("created_at", { ascending: true })
            .limit(2000);
          if (msgs) allMessages = allMessages.concat(msgs);
        }

        let totalResponseTime = 0;
        let responseCount = 0;

        if (allMessages.length > 0) {
          const messagesByConv: Record<string, typeof allMessages> = {};
          for (const msg of allMessages) {
            if (!messagesByConv[msg.conversation_id]) {
              messagesByConv[msg.conversation_id] = [];
            }
            messagesByConv[msg.conversation_id].push(msg);
          }

          for (const convId in messagesByConv) {
            const convMessages = messagesByConv[convId];
            for (let i = 0; i < convMessages.length - 1; i++) {
              const current = convMessages[i];
              const next = convMessages[i + 1];
              if (current.is_from_me === false && next.is_from_me === true) {
                const diffMinutes = (new Date(next.created_at).getTime() - new Date(current.created_at).getTime()) / (1000 * 60);
                if (diffMinutes > 0 && diffMinutes < 1440) {
                  totalResponseTime += diffMinutes;
                  responseCount++;
                }
              }
            }
          }
        }

        avgResponseTime = responseCount > 0 ? Math.round(totalResponseTime / responseCount) : 0;
      }

      return {
        totalReceived,
        totalSent,
        totalConversations: totalConversationsCount || 0,
        activeConversations: activeCount || 0,
        archivedConversations: archivedCount || 0,
        avgResponseTime,
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

      const { startDate, endDate } = getDateRange(filters);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("law_firm_id", lawFirm.id);

      if (!profiles || profiles.length === 0) return [];

      const { data: conversations } = await supabase
        .from("conversations")
        .select("id, assigned_to")
        .eq("law_firm_id", lawFirm.id)
        .gte("updated_at", startDate.toISOString())
        .lte("updated_at", endDate.toISOString());

      const lawFirmConvIds = conversations?.map(c => c.id) || [];

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

      // Fetch messages in chunks
      const chunks = chunkArray(lawFirmConvIds, 500);
      let allMessages: { conversation_id: string; is_from_me: boolean }[] = [];
      
      for (const chunk of chunks) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("conversation_id, is_from_me")
          .in("conversation_id", chunk)
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString())
          .limit(5000);
        if (msgs) allMessages = allMessages.concat(msgs);
      }

      const metricsMap = new Map<string, AttendantMetrics>();

      for (const profile of profiles) {
        const assignedConvs = conversations?.filter(c => c.assigned_to === profile.id) || [];
        const convIdSet = new Set(assignedConvs.map(c => c.id));

        const relatedMessages = allMessages.filter(m => convIdSet.has(m.conversation_id));
        const receivedCount = relatedMessages.filter(m => m.is_from_me === false).length;
        const sentCount = relatedMessages.filter(m => m.is_from_me === true).length;

        metricsMap.set(profile.id, {
          id: profile.id,
          name: profile.full_name || "Sem nome",
          avatarUrl: profile.avatar_url,
          conversationsHandled: assignedConvs.length,
          messagesSent: sentCount,
          messagesReceived: receivedCount,
          avgResponseTime: 0,
        });
      }

      return Array.from(metricsMap.values())
        .sort((a, b) => b.conversationsHandled - a.conversationsHandled);
    },
    enabled: !!lawFirm?.id,
    staleTime: 30000,
  });

  // Fetch time series data - uses exact counts per day (consistent with cards)
  const { data: timeSeriesData, isLoading: timeSeriesLoading } = useQuery({
    queryKey: ["dashboard-time-series", lawFirm?.id, filters],
    queryFn: async (): Promise<TimeSeriesData[]> => {
      if (!lawFirm?.id) return [];

      const { startDate, endDate } = getDateRange(filters);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const maxDays = Math.min(days, 60);

      const today = formatDateForDatabase(new Date());
      const hasFilters = filters.attendantIds.length > 0 || filters.departmentIds.length > 0 || filters.connectionIds.length > 0;

      // Build day buckets
      const buckets: { start: Date; end: Date; label: string; dateStr: string }[] = [];
      for (let i = 0; i < maxDays; i++) {
        const day = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        buckets.push({
          start: startOfDay(day),
          end: endOfDay(day),
          label: format(day, "dd/MM"),
          dateStr: formatDateForDatabase(day),
        });
      }

      // Try to use snapshots for past days (only when no filters)
      let snapshotMap = new Map<string, { received: number; sent: number; conversations: number }>();

      if (!hasFilters) {
        const snapshotStartDate = formatDateForDatabase(startDate);
        const { data: snapshots } = await supabase
          .from("dashboard_daily_snapshots")
          .select("snapshot_date, messages_received, messages_sent, conversations_active")
          .eq("law_firm_id", lawFirm.id)
          .gte("snapshot_date", snapshotStartDate)
          .lt("snapshot_date", today);

        if (snapshots) {
          for (const s of snapshots) {
            snapshotMap.set(s.snapshot_date, {
              received: s.messages_received,
              sent: s.messages_sent,
              conversations: s.conversations_active,
            });
          }
        }
      }

      // Get conversation IDs for real-time calculation
      const convIds = await getFilteredConvIds(lawFirm.id, filters);

      // For each bucket, use snapshot if available, otherwise count in real-time
      const results: TimeSeriesData[] = [];

      for (const bucket of buckets) {
        const cached = snapshotMap.get(bucket.dateStr);

        if (cached) {
          results.push({
            date: bucket.label,
            label: bucket.label,
            received: cached.received,
            sent: cached.sent,
            conversations: cached.conversations,
          });
        } else if (convIds.length === 0) {
          results.push({ date: bucket.label, label: bucket.label, received: 0, sent: 0, conversations: 0 });
        } else {
          // Real-time count for this day using exact counts
          const dayStartISO = bucket.start.toISOString();
          const dayEndISO = bucket.end.toISOString();

          const [received, sent] = await Promise.all([
            countMessagesInChunks(convIds, false, dayStartISO, dayEndISO),
            countMessagesInChunks(convIds, true, dayStartISO, dayEndISO),
          ]);

          // Count distinct conversations with activity
          let convCountQuery = supabase
            .from("conversations")
            .select("id", { count: "exact", head: true })
            .eq("law_firm_id", lawFirm.id)
            .gte("last_message_at", dayStartISO)
            .lte("last_message_at", dayEndISO);
          convCountQuery = applyConvFilters(convCountQuery, filters);
          const { count: convCount } = await convCountQuery;

          results.push({
            date: bucket.label,
            label: bucket.label,
            received,
            sent,
            conversations: convCount || 0,
          });
        }
      }

      return results;
    },
    enabled: !!lawFirm?.id,
    staleTime: 30000,
  });

  return {
    messageMetrics: messageMetrics || { totalReceived: 0, totalSent: 0, totalConversations: 0, activeConversations: 0, archivedConversations: 0, avgResponseTime: 0 },
    attendantMetrics: attendantMetrics || [],
    timeSeriesData: timeSeriesData || [],
    isLoading: metricsLoading || attendantLoading || timeSeriesLoading,
    refetch: refetchMetrics,
  };
}
