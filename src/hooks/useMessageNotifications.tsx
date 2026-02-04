import { useEffect, useCallback } from "react";
import { useLawFirm } from "./useLawFirm";
import { useNotificationSound } from "./useNotificationSound";
import { useNotificationPreferences } from "./useNotificationPreferences";
import { useRealtimeSyncOptional } from "@/hooks/useRealtimeSync";

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
  const { lawFirm } = useLawFirm();
  const { playNotification } = useNotificationSound();
  const { soundEnabled, browserEnabled } = useNotificationPreferences();
  const realtimeSync = useRealtimeSyncOptional();

  const handleNewMessage = useCallback(
    (payload: { new: Message }) => {
      const message = payload.new;

      // Only notify for incoming messages (not from me)
      if (message.is_from_me) return;

      // Play notification sound if enabled
      if (soundEnabled) {
        playNotification();
      }

      // Show browser notification if enabled and permission granted
      if (browserEnabled && "Notification" in window && Notification.permission === "granted") {
        new Notification("Nova mensagem do WhatsApp", {
          body: message.content || "Nova mensagem recebida",
          icon: "/favicon.png",
          tag: message.id,
        });
      }

      // Call custom handler if provided
      onNewMessage?.(message);
    },
    [playNotification, onNewMessage, soundEnabled, browserEnabled]
  );

  useEffect(() => {
    if (!enabled || !lawFirm?.id) return;

    // Request notification permission if browser notifications are enabled
    if (browserEnabled && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Register callback with the consolidated realtime system
    // This uses the tenant-filtered channel from RealtimeSyncContext
    if (realtimeSync?.registerMessageCallback) {
      const unregister = realtimeSync.registerMessageCallback((payload) => {
        if (payload.eventType === "INSERT") {
          handleNewMessage({ new: payload.new as Message });
        }
      });
      return unregister;
    }
  }, [enabled, lawFirm?.id, browserEnabled, realtimeSync, handleNewMessage]);

  return {
    requestNotificationPermission: () => {
      if ("Notification" in window) {
        Notification.requestPermission();
      }
    },
  };
}
