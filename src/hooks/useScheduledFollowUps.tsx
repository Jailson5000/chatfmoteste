import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "./useLawFirm";

export interface ScheduledFollowUp {
  id: string;
  law_firm_id: string;
  client_id: string;
  conversation_id: string;
  follow_up_rule_id: string;
  template_id: string | null;
  scheduled_at: string;
  status: string;
  sent_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  template?: {
    id: string;
    name: string;
    shortcut: string;
    content: string;
  } | null;
}

export function useScheduledFollowUps(conversationId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  // Fetch pending follow-ups for a specific conversation
  const { data: pendingFollowUps = [], isLoading } = useQuery({
    queryKey: ["scheduled-follow-ups", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from("scheduled_follow_ups")
        .select(`
          *,
          template:templates(id, name, shortcut, content)
        `)
        .eq("conversation_id", conversationId)
        .in("status", ["pending", "processing"])
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      return data as ScheduledFollowUp[];
    },
    enabled: !!conversationId,
  });

  // Fetch all pending follow-ups for the company (for card indicators)
  const { data: allPendingFollowUps = [] } = useQuery({
    queryKey: ["all-scheduled-follow-ups", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      const { data, error } = await supabase
        .from("scheduled_follow_ups")
        .select("conversation_id, scheduled_at")
        .eq("law_firm_id", lawFirm.id)
        .in("status", ["pending", "processing"]);

      if (error) throw error;
      return data as Array<{ conversation_id: string; scheduled_at: string }>;
    },
    enabled: !!lawFirm?.id,
    refetchInterval: 60000, // Refresh every minute
  });

  // Real-time subscription for follow-up status changes
  useEffect(() => {
    if (!lawFirm?.id) return;

    const channel = supabase
      .channel('follow-ups-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scheduled_follow_ups',
          filter: `law_firm_id=eq.${lawFirm.id}`,
        },
        (payload) => {
          const newStatus = payload.new?.status;

          // Any status change affects indicators and chat header badge
          if (newStatus) {
            queryClient.invalidateQueries({ queryKey: ["scheduled-follow-ups"] });
            queryClient.invalidateQueries({ queryKey: ["all-scheduled-follow-ups"] });
            queryClient.invalidateQueries({ queryKey: ["messages"] });
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lawFirm?.id, queryClient]);

  // Get count of pending follow-ups per conversation
  const followUpsByConversation = allPendingFollowUps.reduce((acc, fu) => {
    acc[fu.conversation_id] = (acc[fu.conversation_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Cancel a follow-up
  const cancelFollowUp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("scheduled_follow_ups")
        .update({ 
          status: "cancelled", 
          cancelled_at: new Date().toISOString(),
          cancel_reason: "Cancelled by user" 
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["all-scheduled-follow-ups"] });
      toast({ title: "Follow-up cancelado" });
    },
    onError: (error) => {
      toast({ 
        title: "Erro ao cancelar follow-up", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Cancel all pending follow-ups for a conversation
  const cancelAllFollowUps = useMutation({
    mutationFn: async (convId: string) => {
      const { error } = await supabase
        .from("scheduled_follow_ups")
        .update({ 
          status: "cancelled", 
          cancelled_at: new Date().toISOString(),
          cancel_reason: "All cancelled by user" 
        })
        .eq("conversation_id", convId)
        .in("status", ["pending", "processing"]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["all-scheduled-follow-ups"] });
      toast({ title: "Todos os follow-ups cancelados" });
    },
    onError: (error) => {
      toast({ 
        title: "Erro ao cancelar follow-ups", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  return {
    pendingFollowUps,
    isLoading,
    followUpsByConversation,
    cancelFollowUp,
    cancelAllFollowUps,
    hasScheduledFollowUp: (convId: string) => (followUpsByConversation[convId] || 0) > 0,
    getScheduledCount: (convId: string) => followUpsByConversation[convId] || 0,
  };
}
