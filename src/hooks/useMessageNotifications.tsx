import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "./useLawFirm";
import { useNotificationSound } from "./useNotificationSound";
import { useNotificationPreferences } from "./useNotificationPreferences";

interface Message {
  id: string;
  conversation_id: string;
  content: string | null;
  is_from_me: boolean;
  sender_type: string;
  created_at: string;
}

interface UseMessageNotificationsOptions {
  enabled?: boolean;
  onNewMessage?: (message: Message) => void;
}

export function useMessageNotifications(options: UseMessageNotificationsOptions = {}) {
  const { enabled = true, onNewMessage } = options;
  const { toast } = useToast();
  const { lawFirm } = useLawFirm();
  const { playNotification } = useNotificationSound();
  const { soundEnabled, browserEnabled } = useNotificationPreferences();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const handleNewMessage = useCallback(
    (payload: { new: Message }) => {
      const message = payload.new;

      // Only notify for incoming messages (not from me)
      if (message.is_from_me) return;

      // Play notification sound if enabled
      if (soundEnabled) {
        playNotification();
      }

      // Show toast notification (always shown for UX)
      toast({
        title: "Nova mensagem",
        description: message.content
          ? message.content.length > 50
            ? `${message.content.substring(0, 50)}...`
            : message.content
          : "Nova mensagem recebida",
      });

      // Show browser notification if enabled and permission granted
      if (browserEnabled && "Notification" in window && Notification.permission === "granted") {
        new Notification("Nova mensagem do WhatsApp", {
          body: message.content || "Nova mensagem recebida",
          icon: "/fmo-favicon.png",
          tag: message.id,
        });
      }

      // Call custom handler if provided
      onNewMessage?.(message);
    },
    [toast, playNotification, onNewMessage, soundEnabled, browserEnabled]
  );

  useEffect(() => {
    if (!enabled || !lawFirm?.id) return;

    // Request notification permission if browser notifications are enabled
    if (browserEnabled && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Subscribe to realtime messages
    const channel = supabase
      .channel("messages-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        handleNewMessage
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, lawFirm?.id, handleNewMessage, browserEnabled]);

  return {
    requestNotificationPermission: () => {
      if ("Notification" in window) {
        Notification.requestPermission();
      }
    },
  };
}
