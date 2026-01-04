import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo } from "react";
import { ActivityItem } from "@/components/conversations/InlineActivityBadge";

interface ClientAction {
  id: string;
  action_type: string;
  from_value: string | null;
  to_value: string | null;
  description: string | null;
  performed_by: string | null;
  created_at: string;
  performer_profile?: { full_name: string } | null;
}

interface AITransferLog {
  id: string;
  from_agent_name: string | null;
  to_agent_name: string;
  transfer_type: string;
  reason: string | null;
  transferred_by_name: string | null;
  transferred_at: string;
}

export function useInlineActivities(conversationId: string | null, clientId: string | null) {
  const queryClient = useQueryClient();

  // Fetch client actions
  const { data: clientActions = [] } = useQuery({
    queryKey: ["inline-activities-actions", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase
        .from("client_actions")
        .select(`
          id,
          action_type,
          from_value,
          to_value,
          description,
          performed_by,
          created_at,
          performer_profile:profiles!client_actions_performed_by_fkey(full_name)
        `)
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[useInlineActivities] Error fetching client actions:", error);
        return [];
      }
      return data as ClientAction[];
    },
    enabled: !!clientId,
  });

  // Fetch AI transfer logs
  const { data: transferLogs = [] } = useQuery({
    queryKey: ["inline-activities-transfers", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      
      const { data, error } = await supabase
        .from("ai_transfer_logs")
        .select("id, from_agent_name, to_agent_name, transfer_type, reason, transferred_by_name, transferred_at")
        .eq("conversation_id", conversationId)
        .order("transferred_at", { ascending: true });

      if (error) {
        console.error("[useInlineActivities] Error fetching transfer logs:", error);
        return [];
      }
      return data as AITransferLog[];
    },
    enabled: !!conversationId,
  });

  // Real-time subscription
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`inline-activities-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ai_transfer_logs',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["inline-activities-transfers", conversationId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'client_actions',
          filter: clientId ? `client_id=eq.${clientId}` : undefined,
        },
        () => {
          if (clientId) {
            queryClient.invalidateQueries({ queryKey: ["inline-activities-actions", clientId] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, clientId, queryClient]);

  // Transform to activity items
  const activities = useMemo(() => {
    const items: ActivityItem[] = [];

    // Transform client actions
    clientActions.forEach((action) => {
      const performerName = (action.performer_profile as any)?.full_name || "Sistema";
      
      let description = "";
      if (action.action_type === 'status_change') {
        if (action.from_value && action.to_value) {
          description = `de ${action.from_value} para ${action.to_value}`;
        } else if (action.to_value) {
          description = action.to_value;
        }
      } else if (action.action_type.includes('tag')) {
        description = action.to_value || action.from_value || "";
      } else if (action.action_type === 'department_change') {
        description = action.to_value || "";
      }

      items.push({
        id: `action-${action.id}`,
        type: action.action_type as ActivityItem['type'],
        performer: action.performed_by ? performerName : "IA",
        description,
        timestamp: new Date(action.created_at),
        isAI: !action.performed_by,
      });
    });

    // Transform transfer logs
    transferLogs.forEach((log) => {
      const isAI = log.transfer_type === 'ai';
      const isHuman = log.transfer_type === 'human';
      
      let description = '';
      if (isAI) {
        description = `Transferido para IA: ${log.to_agent_name}`;
      } else if (isHuman) {
        description = `Transferido para atendente: ${log.to_agent_name}`;
      } else {
        description = `Transferido para: ${log.to_agent_name}`;
      }

      items.push({
        id: `transfer-${log.id}`,
        type: 'transfer',
        performer: log.transferred_by_name || (log.from_agent_name ? `IA: ${log.from_agent_name}` : "Sistema"),
        description,
        timestamp: new Date(log.transferred_at),
        isAI,
      });
    });

    return items.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [clientActions, transferLogs]);

  return { activities };
}
