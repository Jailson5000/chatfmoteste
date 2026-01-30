import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLawFirm } from "@/hooks/useLawFirm";

const THROTTLE_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function usePresenceTracking() {
  const { user } = useAuth();
  const { lawFirm } = useLawFirm();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const updateLastSeen = useCallback(async () => {
    if (!user?.id) return;

    const now = Date.now();
    // Throttle: only update every 5 minutes
    if (now - lastUpdateRef.current < THROTTLE_INTERVAL) return;

    lastUpdateRef.current = now;
    
    try {
      await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", user.id);
    } catch (error) {
      console.error("Error updating last_seen_at:", error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !lawFirm?.id) return;

    // Update immediately on mount
    updateLastSeen();

    // Create presence channel
    const channel = supabase.channel(`presence:${lawFirm.id}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        // State synchronized
      })
      .on("presence", { event: "join" }, ({ key }) => {
        console.log("[Presence] User joined:", key);
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        console.log("[Presence] User left:", key);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    // Throttled activity handler
    let activityTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleActivity = () => {
      if (activityTimeout) return;
      activityTimeout = setTimeout(() => {
        updateLastSeen();
        activityTimeout = null;
      }, 60000); // 1 minute throttle for activity
    };

    // Listen for user activity
    window.addEventListener("click", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("scroll", handleActivity, { passive: true });

    // Cleanup on unmount or logout
    const handleBeforeUnload = () => {
      channel.untrack();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (activityTimeout) clearTimeout(activityTimeout);
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user?.id, lawFirm?.id, updateLastSeen]);
}
