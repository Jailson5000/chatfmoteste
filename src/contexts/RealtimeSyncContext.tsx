import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useLawFirm } from "@/hooks/useLawFirm";
import { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// ============================================================================
// CENTRALIZED REALTIME SYNC CONTEXT
// ============================================================================
// Consolidates ~18 individual Realtime channels into 3-4 channels per tenant
// Reduces WebSocket usage by ~75% while maintaining full functionality
// ============================================================================

interface RealtimeSyncContextType {
  // Connection state
  isConnected: boolean;
  channelCount: number;
  
  // Dynamic conversation-specific subscription
  subscribeToConversation: (conversationId: string, clientId?: string | null) => void;
  unsubscribeFromConversation: () => void;
  activeConversationId: string | null;
  
  // Callbacks for special handling
  registerMessageCallback: (callback: MessageCallback) => () => void;
  registerConversationCallback: (callback: ConversationCallback) => () => void;
  
  // Disconnect all channels (for tab session management)
  disconnectAll: () => void;
}

type MessageCallback = (payload: RealtimePostgresChangesPayload<any>) => void;
type ConversationCallback = (payload: RealtimePostgresChangesPayload<any>) => void;

const RealtimeSyncContext = createContext<RealtimeSyncContextType | null>(null);

// Query key mapping for invalidation
const TABLE_TO_QUERY_KEYS: Record<string, string[][]> = {
  conversations: [
    ["conversations"],
    ["conversation-counts"],
  ],
  clients: [
    ["conversations"],
    ["clients"],
    ["agenda-clients"],
  ],
  custom_statuses: [
    ["custom_statuses"],
    ["conversations"],
  ],
  departments: [
    ["departments"],
    ["conversations"],
  ],
  tags: [
    ["tags"],
  ],
  scheduled_follow_ups: [
    ["scheduled-follow-ups"],
    ["all-scheduled-follow-ups"],
    ["messages"],
    ["conversations"],
  ],
  whatsapp_instances: [
    ["whatsapp-instances"],
  ],
  messages: [
    ["conversations"],
    ["dashboard-message-metrics"],
    ["dashboard-attendant-metrics"],
    ["dashboard-time-series"],
  ],
  appointments: [
    ["appointments"],
    ["google-calendar-events"],
    ["calendar-events"],
  ],
  agenda_pro_appointments: [
    ["agenda-pro-appointments"],
    ["agenda-pro-clients"],
    ["agenda-pro-activity-log"],
    ["agenda-pro-scheduled-messages"],
  ],
  ai_transfer_logs: [
    ["inline-activities-transfers"],
  ],
  client_actions: [
    ["inline-activities-actions"],
  ],
};

interface RealtimeSyncProviderProps {
  children: React.ReactNode;
}

export function RealtimeSyncProvider({ children }: RealtimeSyncProviderProps) {
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();
  
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [channelCount, setChannelCount] = useState(0);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  
  // Refs for channels
  const coreChannelRef = useRef<RealtimeChannel | null>(null);
  const messagesChannelRef = useRef<RealtimeChannel | null>(null);
  const agendaChannelRef = useRef<RealtimeChannel | null>(null);
  const conversationChannelRef = useRef<RealtimeChannel | null>(null);
  
  // Refs for callbacks
  const messageCallbacksRef = useRef<Set<MessageCallback>>(new Set());
  const conversationCallbacksRef = useRef<Set<ConversationCallback>>(new Set());
  
  // Debounce refs to prevent excessive invalidations
  const invalidationTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const activeClientIdRef = useRef<string | null>(null);

  // Debounced invalidation helper
  const debouncedInvalidate = useCallback((queryKeys: string[][], debounceMs = 500) => {
    queryKeys.forEach(queryKey => {
      const key = queryKey.join('-');
      
      // Clear existing timer for this key
      const existingTimer = invalidationTimersRef.current.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      
      // Set new debounced invalidation
      const timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey });
        invalidationTimersRef.current.delete(key);
      }, debounceMs);
      
      invalidationTimersRef.current.set(key, timer);
    });
  }, [queryClient]);

  // Handle table change events
  const handleTableChange = useCallback((table: string, payload: RealtimePostgresChangesPayload<any>) => {
    // Get query keys to invalidate
    const queryKeys = TABLE_TO_QUERY_KEYS[table] || [];
    
    // Use shorter debounce for critical tables
    // Messages: 100ms for near-instant feedback
    // Conversations: 300ms to avoid spam during typing indicators
    const debounceMs = table === 'messages' ? 100 : 
                       table === 'conversations' ? 300 : 500;
    
    debouncedInvalidate(queryKeys, debounceMs);
    
    // Notify registered callbacks
    if (table === 'messages') {
      messageCallbacksRef.current.forEach(cb => cb(payload));
    }
    if (table === 'conversations') {
      conversationCallbacksRef.current.forEach(cb => cb(payload));
    }
  }, [debouncedInvalidate]);

  // Setup tenant-wide channels
  useEffect(() => {
    if (!lawFirm?.id) {
      // Cleanup if no law firm
      [coreChannelRef, messagesChannelRef, agendaChannelRef].forEach(ref => {
        if (ref.current) {
          supabase.removeChannel(ref.current);
          ref.current = null;
        }
      });
      setIsConnected(false);
      setChannelCount(0);
      return;
    }

    const lawFirmId = lawFirm.id;
    let activeChannels = 0;

    // ========================================================================
    // CHANNEL 1: tenant-core - Core tenant data (conversations, clients, etc.)
    // ========================================================================
    coreChannelRef.current = supabase
      .channel(`tenant-core-${lawFirmId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `law_firm_id=eq.${lawFirmId}`,
      }, (payload) => handleTableChange('conversations', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'clients',
        filter: `law_firm_id=eq.${lawFirmId}`,
      }, (payload) => handleTableChange('clients', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'custom_statuses',
        filter: `law_firm_id=eq.${lawFirmId}`,
      }, (payload) => handleTableChange('custom_statuses', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'departments',
        filter: `law_firm_id=eq.${lawFirmId}`,
      }, (payload) => handleTableChange('departments', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tags',
        filter: `law_firm_id=eq.${lawFirmId}`,
      }, (payload) => handleTableChange('tags', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'scheduled_follow_ups',
        filter: `law_firm_id=eq.${lawFirmId}`,
      }, (payload) => handleTableChange('scheduled_follow_ups', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_instances',
        filter: `law_firm_id=eq.${lawFirmId}`,
      }, (payload) => handleTableChange('whatsapp_instances', payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          activeChannels++;
          setChannelCount(activeChannels);
          setIsConnected(true);
        }
      });

    // ========================================================================
    // CHANNEL 2: tenant-messages - All messages for the tenant (FILTERED)
    // Now uses law_firm_id column for efficient Realtime filtering
    // ========================================================================
    messagesChannelRef.current = supabase
      .channel(`tenant-messages-${lawFirmId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `law_firm_id=eq.${lawFirmId}`,
      }, (payload) => handleTableChange('messages', payload))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `law_firm_id=eq.${lawFirmId}`,
      }, (payload) => handleTableChange('messages', payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          activeChannels++;
          setChannelCount(activeChannels);
        }
      });

    // ========================================================================
    // CHANNEL 3: tenant-agenda - Appointments and scheduling
    // ========================================================================
    agendaChannelRef.current = supabase
      .channel(`tenant-agenda-${lawFirmId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments',
        filter: `law_firm_id=eq.${lawFirmId}`,
      }, (payload) => handleTableChange('appointments', payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agenda_pro_appointments',
        filter: `law_firm_id=eq.${lawFirmId}`,
      }, (payload) => handleTableChange('agenda_pro_appointments', payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          activeChannels++;
          setChannelCount(activeChannels);
        }
      });

    // Cleanup
    return () => {
      // Clear all debounce timers
      invalidationTimersRef.current.forEach(timer => clearTimeout(timer));
      invalidationTimersRef.current.clear();
      
      [coreChannelRef, messagesChannelRef, agendaChannelRef].forEach(ref => {
        if (ref.current) {
          supabase.removeChannel(ref.current);
          ref.current = null;
        }
      });
      setIsConnected(false);
      setChannelCount(0);
    };
  }, [lawFirm?.id, handleTableChange]);

  // ========================================================================
  // CHANNEL 4 (Dynamic): conversation-specific for active chat
  // ========================================================================
  const subscribeToConversation = useCallback((conversationId: string, clientId?: string | null) => {
    // Cleanup existing subscription
    if (conversationChannelRef.current) {
      supabase.removeChannel(conversationChannelRef.current);
      conversationChannelRef.current = null;
    }

    setActiveConversationId(conversationId);
    activeClientIdRef.current = clientId || null;

    // Create conversation-specific channel
    let channel = supabase
      .channel(`conversation-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        // Invalidate paginated messages for this conversation
        queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        handleTableChange('messages', payload);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        handleTableChange('messages', payload);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ai_transfer_logs',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => handleTableChange('ai_transfer_logs', payload));

    // Add client_actions listener if clientId is provided
    if (clientId) {
      channel = channel.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'client_actions',
        filter: `client_id=eq.${clientId}`,
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["inline-activities-actions", clientId] });
        handleTableChange('client_actions', payload);
      });
    }

    conversationChannelRef.current = channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setChannelCount(prev => prev + 1);
      }
    });
  }, [queryClient, handleTableChange]);

  const unsubscribeFromConversation = useCallback(() => {
    if (conversationChannelRef.current) {
      supabase.removeChannel(conversationChannelRef.current);
      conversationChannelRef.current = null;
      setChannelCount(prev => Math.max(0, prev - 1));
    }
    setActiveConversationId(null);
    activeClientIdRef.current = null;
  }, []);

  // Callback registration
  const registerMessageCallback = useCallback((callback: MessageCallback) => {
    messageCallbacksRef.current.add(callback);
    return () => {
      messageCallbacksRef.current.delete(callback);
    };
  }, []);

  const registerConversationCallback = useCallback((callback: ConversationCallback) => {
    conversationCallbacksRef.current.add(callback);
    return () => {
      conversationCallbacksRef.current.delete(callback);
    };
  }, []);

  // Disconnect all channels (for tab session management)
  const disconnectAll = useCallback(() => {
    // Clear all debounce timers
    invalidationTimersRef.current.forEach(timer => clearTimeout(timer));
    invalidationTimersRef.current.clear();
    
    // Remove all channels
    [coreChannelRef, messagesChannelRef, agendaChannelRef, conversationChannelRef].forEach(ref => {
      if (ref.current) {
        supabase.removeChannel(ref.current);
        ref.current = null;
      }
    });
    
    setIsConnected(false);
    setChannelCount(0);
    setActiveConversationId(null);
    activeClientIdRef.current = null;
    
    console.log("[RealtimeSync] All channels disconnected");
  }, []);

  const value: RealtimeSyncContextType = {
    isConnected,
    channelCount,
    subscribeToConversation,
    unsubscribeFromConversation,
    activeConversationId,
    registerMessageCallback,
    registerConversationCallback,
    disconnectAll,
  };

  return (
    <RealtimeSyncContext.Provider value={value}>
      {children}
    </RealtimeSyncContext.Provider>
  );
}

export function useRealtimeSync() {
  const context = useContext(RealtimeSyncContext);
  if (!context) {
    throw new Error("useRealtimeSync must be used within a RealtimeSyncProvider");
  }
  return context;
}

// Optional hook that returns undefined if not in provider (for gradual migration)
export function useRealtimeSyncOptional() {
  return useContext(RealtimeSyncContext);
}
