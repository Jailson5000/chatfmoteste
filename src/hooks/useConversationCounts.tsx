import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useAuth } from "@/hooks/useAuth";

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
 * Real-time updates are handled by centralized useRealtimeSync.
 */
export function useConversationCounts() {
  const { lawFirm } = useLawFirm();
  const { user } = useAuth();

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
    staleTime: 30000, // Consider data stale after 30 seconds
    refetchInterval: 120000, // 2 min fallback - Realtime handles live updates
  });

  // Real-time subscription removed - now handled by centralized useRealtimeSync

  return {
    counts: counts || { chat: 0, ai: 0, queue: 0, all: 0, archived: 0 },
    isLoading,
    refetch
  };
}
