import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PresenceState {
  onlineUsers: Record<string, boolean>;
  isLoading: boolean;
}

export function useUserPresence(lawFirmId: string | null) {
  const [state, setState] = useState<PresenceState>({
    onlineUsers: {},
    isLoading: true,
  });

  useEffect(() => {
    if (!lawFirmId) {
      setState({ onlineUsers: {}, isLoading: false });
      return;
    }

    const channel = supabase.channel(`presence:${lawFirmId}`);

    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        const online: Record<string, boolean> = {};
        
        Object.keys(presenceState).forEach((key) => {
          online[key] = true;
        });
        
        setState({ onlineUsers: online, isLoading: false });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lawFirmId]);

  const isUserOnline = useCallback(
    (userId: string): boolean => {
      return state.onlineUsers[userId] ?? false;
    },
    [state.onlineUsers]
  );

  const onlineCount = Object.keys(state.onlineUsers).length;

  return {
    onlineUsers: state.onlineUsers,
    isUserOnline,
    onlineCount,
    isLoading: state.isLoading,
  };
}
