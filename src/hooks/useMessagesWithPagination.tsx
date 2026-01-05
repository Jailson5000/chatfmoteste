import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface PaginatedMessage {
  id: string;
  content: string;
  created_at: string;
  is_from_me: boolean;
  sender_type?: string;
  ai_generated?: boolean;
  media_url?: string;
  media_mime_type?: string;
  message_type?: string;
  read_at?: string;
  reply_to_message_id?: string;
  whatsapp_message_id?: string;
  ai_agent_id?: string;
  ai_agent_name?: string;
  status?: string;
  delivered_at?: string;
  is_internal?: boolean;
  is_pontual?: boolean;
  reply_to?: {
    id: string;
    content: string;
    is_from_me: boolean;
  } | null;
}

interface UseMessagesWithPaginationOptions {
  conversationId: string | null;
  initialBatchSize?: number;
  loadMoreBatchSize?: number;
  onNewMessage?: (message: PaginatedMessage) => void;
}

interface UseMessagesWithPaginationReturn {
  messages: PaginatedMessage[];
  setMessages: React.Dispatch<React.SetStateAction<PaginatedMessage[]>>;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMoreMessages: boolean;
  totalCount: number;
  loadMore: () => Promise<void>;
  handleScrollToTop: (viewport: HTMLDivElement | null) => void;
}

export function useMessagesWithPagination({
  conversationId,
  initialBatchSize = 50,
  loadMoreBatchSize = 30,
  onNewMessage,
}: UseMessagesWithPaginationOptions): UseMessagesWithPaginationReturn {
  const { toast } = useToast();
  const [messages, setMessages] = useState<PaginatedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  
  // Guards to prevent loops
  const loadingMoreRef = useRef(false);
  const oldestTimestampRef = useRef<string | null>(null);
  const lastLoadTimeRef = useRef(0);

  // Scroll anchoring for prepend
  const pendingRestoreRef = useRef<{
    viewport: HTMLDivElement;
    prevScrollHeight: number;
    prevScrollTop: number;
  } | null>(null);

  // Reset when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setHasMoreMessages(true);
      setTotalCount(0);
      oldestTimestampRef.current = null;
      loadingMoreRef.current = false;
      return;
    }

    const loadInitialMessages = async () => {
      setIsLoading(true);
      setHasMoreMessages(true);
      oldestTimestampRef.current = null;
      loadingMoreRef.current = false;

      try {
        // Get total count first
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", conversationId);

        setTotalCount(count || 0);

        // Fetch the most recent messages (ordered desc, then reverse for display)
        const { data, error } = await supabase
          .from("messages")
          .select("id, content, created_at, is_from_me, sender_type, ai_generated, media_url, media_mime_type, message_type, read_at, reply_to_message_id, whatsapp_message_id, ai_agent_id, ai_agent_name, status, delivered_at, is_internal")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(initialBatchSize);

        if (error) {
          console.error("Error fetching messages:", error);
          toast({
            title: "Erro ao carregar mensagens",
            description: error.message,
            variant: "destructive",
          });
          return;
        }

        if (data) {
          // Reverse to get chronological order for display
          const chronologicalMessages = [...data].reverse();
          
          // Map reply_to data
          const messagesWithReplies = chronologicalMessages.map(msg => {
            if (msg.reply_to_message_id) {
              const replyTo = chronologicalMessages.find(m => m.id === msg.reply_to_message_id);
              return {
                ...msg,
                reply_to: replyTo ? {
                  id: replyTo.id,
                  content: replyTo.content,
                  is_from_me: replyTo.is_from_me,
                } : null
              };
            }
            return { ...msg, reply_to: null };
          }) as PaginatedMessage[];

          setMessages(messagesWithReplies);
          
          // Track the oldest message timestamp for pagination
          if (data.length > 0) {
            oldestTimestampRef.current = data[data.length - 1].created_at; // Last in desc order = oldest
          }
          
          // Check if we have more messages
          setHasMoreMessages((count || 0) > initialBatchSize);

          // Mark messages as read
          const { data: userData } = await supabase.auth.getUser();
          if (userData.user?.id) {
            await supabase.rpc('mark_messages_as_read', {
              _conversation_id: conversationId,
              _user_id: userData.user.id
            });
          }
        }
      } catch (err) {
        console.error("Error loading messages:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialMessages();
  }, [conversationId, initialBatchSize, toast]);

  // Load more older messages
  const loadMore = useCallback(async () => {
    // Triple guard: ref, state, and timestamp
    if (loadingMoreRef.current) return;
    if (!hasMoreMessages) return;
    if (!conversationId || !oldestTimestampRef.current) return;
    
    // Debounce: minimum 150ms between loads
    const now = Date.now();
    if (now - lastLoadTimeRef.current < 150) return;
    lastLoadTimeRef.current = now;

    loadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id, content, created_at, is_from_me, sender_type, ai_generated, media_url, media_mime_type, message_type, read_at, reply_to_message_id, whatsapp_message_id, ai_agent_id, ai_agent_name, status, delivered_at, is_internal")
        .eq("conversation_id", conversationId)
        .lt("created_at", oldestTimestampRef.current)
        .order("created_at", { ascending: false })
        .limit(loadMoreBatchSize);

      if (error) {
        console.error("Error loading more messages:", error);
        pendingRestoreRef.current = null;
        return;
      }

      if (data && data.length > 0) {
        // Reverse to get chronological order
        const chronologicalNewMessages = [...data].reverse();
        
        // Map reply_to data
        const newMessagesWithReplies = chronologicalNewMessages.map(msg => ({
          ...msg,
          reply_to: null
        })) as PaginatedMessage[];

        // Prepend older messages to the beginning
        setMessages(prev => [...newMessagesWithReplies, ...prev]);
        
        // Update oldest timestamp
        oldestTimestampRef.current = data[data.length - 1].created_at;
        
        // Check if more exist
        if (data.length < loadMoreBatchSize) {
          setHasMoreMessages(false);
        }
      } else {
        pendingRestoreRef.current = null;
        setHasMoreMessages(false);
      }
    } catch (err) {
      console.error("Error loading more messages:", err);
      pendingRestoreRef.current = null;
    } finally {
      setIsLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [conversationId, hasMoreMessages, loadMoreBatchSize]);

  // Handle scroll to top to load more
  const handleScrollToTop = useCallback(
    (viewport: HTMLDivElement | null) => {
      if (!viewport) return;
      
      // Skip if already loading
      if (loadingMoreRef.current || isLoadingMore) return;
      if (!hasMoreMessages) return;
      if (!oldestTimestampRef.current) return;

      const scrollTop = viewport.scrollTop;

      // If scrolled near top (within 100px), load more
      if (scrollTop < 100) {
        // Save scroll position BEFORE loading
        pendingRestoreRef.current = {
          viewport,
          prevScrollHeight: viewport.scrollHeight,
          prevScrollTop: scrollTop,
        };

        void loadMore();
      }
    },
    [loadMore, hasMoreMessages, isLoadingMore]
  );

  // After older messages are prepended, restore scroll so the same content stays visible
  // This runs synchronously before browser paint
  useLayoutEffect(() => {
    const pending = pendingRestoreRef.current;
    if (!pending) return;

    const { viewport, prevScrollHeight, prevScrollTop } = pending;
    const newScrollHeight = viewport.scrollHeight;
    const delta = newScrollHeight - prevScrollHeight;

    // Only adjust if content was actually added
    if (delta > 0) {
      viewport.scrollTop = prevScrollTop + delta;
    }

    pendingRestoreRef.current = null;
  }, [messages]); // Run when messages array changes

  // Real-time subscriptions
  useEffect(() => {
    if (!conversationId) return;

    // Subscribe to new messages (INSERT)
    const insertChannel = supabase
      .channel(`messages-insert-paginated-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const newMsg = payload.new as PaginatedMessage;

          setMessages(prev => {
            // Prevent duplicates
            if (prev.some(m => m.id === newMsg.id)) return prev;

            // Check for optimistic message replacement
            const optimisticIndex = prev.findIndex(m =>
              m.is_from_me === newMsg.is_from_me &&
              m.content === newMsg.content &&
              (m.status === "sending" || m.status === "sent" || !m.whatsapp_message_id) &&
              Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 30000
            );

            if (optimisticIndex !== -1) {
              const updated = [...prev];
              updated[optimisticIndex] = { ...newMsg, status: "sent" };
              return updated;
            }

            // Last-resort duplicate guard
            if (newMsg.is_from_me) {
              const isDuplicate = prev.some(m =>
                m.content === newMsg.content &&
                m.is_from_me === true &&
                Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 30000
              );
              if (isDuplicate) return prev;
            }

            return [...prev, newMsg];
          });

          // Callback for new message (e.g., play notification)
          if (!newMsg.is_from_me && onNewMessage) {
            onNewMessage(newMsg);
          }
        }
      )
      .subscribe();

    // Subscribe to message updates (UPDATE) for status ticks
    const updateChannel = supabase
      .channel(`messages-update-paginated-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const updatedMsg = payload.new as PaginatedMessage;
          setMessages(prev => prev.map(m =>
            m.id === updatedMsg.id
              ? {
                  ...m,
                  status: updatedMsg.status,
                  delivered_at: updatedMsg.delivered_at,
                  read_at: updatedMsg.read_at,
                }
              : m
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(insertChannel);
      supabase.removeChannel(updateChannel);
    };
  }, [conversationId, onNewMessage]);

  return {
    messages,
    setMessages,
    isLoading,
    isLoadingMore,
    hasMoreMessages,
    totalCount,
    loadMore,
    handleScrollToTop,
  };
}
