import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

interface TabCounts {
  chat: number;
  ai: number;
  queue: number;
  all: number;
  archived: number;
}

/**
 * Hook to fetch conversation tab counts directly from the database.
 * This ensures consistent counts regardless of pagination state.
 */
export function useConversationCounts() {
  const { lawFirm } = useLawFirm();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: counts, isLoading, refetch } = useQuery({
    queryKey: ["conversation-counts", lawFirm?.id, user?.id],
    queryFn: async (): Promise<TabCounts> => {
      if (!lawFirm?.id) {
        return { chat: 0, ai: 0, queue: 0, all: 0, archived: 0 };
      }

      const { data, error } = await supabase
        .rpc('get_conversation_tab_counts', {
          _law_firm_id: lawFirm.id,
          _user_id: user?.id || null
        });

      if (error) {
        console.error('Error fetching conversation counts:', error);
        throw error;
      }

      // Parse the JSONB response
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      
      return {
        chat: Number(parsed?.chat) || 0,
        ai: Number(parsed?.ai) || 0,
        queue: Number(parsed?.queue) || 0,
        all: Number(parsed?.all) || 0,
        archived: Number(parsed?.archived) || 0
      } as TabCounts;
    },
    enabled: !!lawFirm?.id,
    staleTime: 5000, // Consider data stale after 5 seconds
    refetchInterval: 30000, // Refetch every 30 seconds as fallback
  });

  // Subscribe to realtime changes to invalidate counts
  useEffect(() => {
    if (!lawFirm?.id) return;

    const channel = supabase
      .channel('conversation-counts-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `law_firm_id=eq.${lawFirm.id}`
        },
        () => {
          // Debounce: wait a bit before refetching to batch rapid changes
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ["conversation-counts"] });
          }, 500);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lawFirm?.id, queryClient]);

  return {
    counts: counts || { chat: 0, ai: 0, queue: 0, all: 0, archived: 0 },
    isLoading,
    refetch
  };
}
