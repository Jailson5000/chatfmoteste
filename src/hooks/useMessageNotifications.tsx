import { useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLawFirm } from "./useLawFirm";
import { useAuth } from "./useAuth";
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { playNotification } = useNotificationSound();
  const { soundEnabled, browserEnabled } = useNotificationPreferences();
  const realtimeSync = useRealtimeSyncOptional();

  const handleNewMessage = useCallback(
    (payload: { new: Message }) => {
      const message = payload.new;

      // Only notify for incoming client messages (not from AI, bot, or agents)
      if (message.is_from_me) return;
      if (message.sender_type !== 'client') return;

      // Smart notification: check conversation assignment
      const cachedData = queryClient.getQueryData<any[]>(["conversations", lawFirm?.id]);
      const conversation = cachedData?.find((c: any) => c.id === message.conversation_id);

      // If conversation not in cache (new or recently unarchived), always notify
      if (!conversation) {
        if (soundEnabled) {
          playNotification();
        }
        if (browserEnabled && "Notification" in window && Notification.permission === "granted") {
          new Notification("Nova mensagem do WhatsApp", {
            body: message.content || "Nova mensagem recebida",
            icon: "/favicon.png",
            tag: message.id,
          });
        }
        onNewMessage?.(message);
        return;
      }

      // If AI is handling -> no notification
      if (conversation?.current_handler === 'ai') return;

      // If assigned to a specific human -> only notify that human
      if (conversation?.assigned_to) {
        if (conversation.assigned_to !== user?.id) return;
      }

      // If unassigned (no assigned_to) -> notify everyone (continue)

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
    [playNotification, onNewMessage, soundEnabled, browserEnabled, queryClient, lawFirm?.id, user?.id]
  );

  // Handle conversation transfer notifications
  const handleConversationTransfer = useCallback(
    (payload: any) => {
      if (payload.eventType !== 'UPDATE') return;

      const newRecord = payload.new;
      const oldRecord = payload.old;

      // Only notify if assigned_to changed TO the logged-in user
      if (newRecord.assigned_to !== user?.id) return;
      if (oldRecord.assigned_to === newRecord.assigned_to) return;

      // Suprimir som quando o atendente se auto-atribui ao enviar mensagem
      // (assigned_to era null e IA nao estava no controle)
      if (!oldRecord.assigned_to && oldRecord.current_handler !== 'ai') return;

      // Play notification sound if enabled
      if (soundEnabled) {
        playNotification();
      }

      // Show browser notification if enabled
      if (browserEnabled && "Notification" in window && Notification.permission === "granted") {
        new Notification("Conversa transferida para você", {
          body: "Uma conversa foi atribuída a você",
          icon: "/favicon.png",
          tag: `transfer-${newRecord.id}`,
        });
      }
    },
    [user?.id, soundEnabled, browserEnabled, playNotification]
  );

  useEffect(() => {
    if (!enabled || !lawFirm?.id) return;

    // Request notification permission if browser notifications are enabled
    if (browserEnabled && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const unregisters: (() => void)[] = [];

    // Register message callback
    if (realtimeSync?.registerMessageCallback) {
      unregisters.push(
        realtimeSync.registerMessageCallback((payload) => {
          if (payload.eventType === "INSERT") {
            handleNewMessage({ new: payload.new as Message });
          }
        })
      );
    }

    // Register conversation transfer callback
    if (realtimeSync?.registerConversationCallback) {
      unregisters.push(
        realtimeSync.registerConversationCallback(handleConversationTransfer)
      );
    }

    return () => unregisters.forEach(fn => fn());
  }, [enabled, lawFirm?.id, browserEnabled, realtimeSync, handleNewMessage, handleConversationTransfer]);

  return {
    requestNotificationPermission: () => {
      if ("Notification" in window) {
        Notification.requestPermission();
      }
    },
  };
}
