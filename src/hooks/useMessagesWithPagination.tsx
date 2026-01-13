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
  is_revoked?: boolean;
  is_starred?: boolean;
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
  const restoringScrollRef = useRef(false);
  const oldestTimestampRef = useRef<string | null>(null);
  const lastLoadTimeRef = useRef(0);

  // Scroll anchoring for prepend (anchor-based, not scrollHeight-based)
  const pendingRestoreRef = useRef<{
    viewport: HTMLDivElement;
    anchorId: string;
    anchorOffsetTop: number; // px from viewport top
    stage: "loading" | "done"; // keep restoring during spinner + message prepend
  } | null>(null);

  const cssEscape = (value: string) => {
    // CSS.escape may not exist in some environments
    const esc = (globalThis as any).CSS?.escape;
    return typeof esc === "function" ? esc(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  };

  const getFirstVisibleAnchor = (viewport: HTMLDivElement) => {
    const viewportRect = viewport.getBoundingClientRect();
    const nodes = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-message-id]")
    );

    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > viewportRect.top + 1) {
        const id = el.dataset.messageId;
        if (!id) continue;
        return { anchorId: id, anchorOffsetTop: rect.top - viewportRect.top };
      }
    }

    return null;
  };

  // Reset when conversation changes
  useEffect(() => {
    // Always reset scroll/pagination guards when switching conversations.
    // This prevents stale “restore scroll” state from the previous chat from affecting the next one.
    pendingRestoreRef.current = null;
    restoringScrollRef.current = false;
    loadingMoreRef.current = false;
    oldestTimestampRef.current = null;
    lastLoadTimeRef.current = 0;
    setIsLoadingMore(false);

    if (!conversationId) {
      setMessages([]);
      setHasMoreMessages(true);
      setTotalCount(0);
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
          .select("id, content, created_at, is_from_me, sender_type, ai_generated, media_url, media_mime_type, message_type, read_at, reply_to_message_id, whatsapp_message_id, ai_agent_id, ai_agent_name, status, delivered_at, is_internal, is_revoked, is_starred")
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
    // Guards: ref + state + cursor
    if (loadingMoreRef.current) return;
    if (!hasMoreMessages) return;
    if (!conversationId || !oldestTimestampRef.current) return;

    loadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, content, created_at, is_from_me, sender_type, ai_generated, media_url, media_mime_type, message_type, read_at, reply_to_message_id, whatsapp_message_id, ai_agent_id, ai_agent_name, status, delivered_at, is_internal, is_revoked, is_starred"
        )
        .eq("conversation_id", conversationId)
        .lt("created_at", oldestTimestampRef.current)
        .order("created_at", { ascending: false })
        .limit(loadMoreBatchSize);

      if (error) {
        console.error("Error loading more messages:", error);
        pendingRestoreRef.current = null;
        restoringScrollRef.current = false;
        loadingMoreRef.current = false;
        return;
      }

      if (data && data.length > 0) {
        // Reverse to get chronological order
        const chronologicalNewMessages = [...data].reverse();

        // Map reply_to data
        const newMessagesWithReplies = chronologicalNewMessages.map((msg) => ({
          ...msg,
          reply_to: null,
        })) as PaginatedMessage[];

        // Prepend older messages to the beginning
        setMessages((prev) => [...newMessagesWithReplies, ...prev]);

        // Update oldest timestamp
        oldestTimestampRef.current = data[data.length - 1].created_at;

        // Check if more exist
        if (data.length < loadMoreBatchSize) {
          setHasMoreMessages(false);
        }
      } else {
        pendingRestoreRef.current = null;
        restoringScrollRef.current = false;
        setHasMoreMessages(false);
        loadingMoreRef.current = false;
      }
    } catch (err) {
      console.error("Error loading more messages:", err);
      pendingRestoreRef.current = null;
      restoringScrollRef.current = false;
      loadingMoreRef.current = false;
    } finally {
      // Mark fetch complete; we keep restoring until the final render settles.
      if (pendingRestoreRef.current) {
        pendingRestoreRef.current.stage = "done";
      }

      setIsLoadingMore(false);
      // IMPORTANT: não liberar loadingMoreRef aqui se ainda vamos restaurar scroll;
      // a liberação acontece no useLayoutEffect após a restauração.
      if (!pendingRestoreRef.current) {
        loadingMoreRef.current = false;
      }
    }
  }, [conversationId, hasMoreMessages, loadMoreBatchSize]);

  // Handle scroll to top to load more
  const handleScrollToTop = useCallback(
    (viewport: HTMLDivElement | null) => {
      if (!viewport) return;

      // Skip if restoring or already loading
      if (restoringScrollRef.current) return;
      if (loadingMoreRef.current || isLoadingMore) return;
      if (!hasMoreMessages) return;
      if (!oldestTimestampRef.current) return;

      const scrollTop = viewport.scrollTop;

      // If scrolled near top (within 100px), load more
      if (scrollTop < 100) {
        // Debounce: minimum 200ms between triggers
        const now = Date.now();
        if (now - lastLoadTimeRef.current < 200) return;
        lastLoadTimeRef.current = now;

        // Capture anchor BEFORE loading (first visible message)
        const anchor = getFirstVisibleAnchor(viewport);
        if (!anchor) return;

        restoringScrollRef.current = true;
        pendingRestoreRef.current = {
          viewport,
          anchorId: anchor.anchorId,
          anchorOffsetTop: anchor.anchorOffsetTop,
          stage: "loading",
        };

        void loadMore();
      }
    },
    [loadMore, hasMoreMessages, isLoadingMore]
  );

  // After older messages are prepended (and while the "loading more" UI is shown),
  // restore scroll so the same content stays visible.
  // Anchor-based restore (no scrollHeight math)
  useLayoutEffect(() => {
    const pending = pendingRestoreRef.current;
    if (!pending) return;

    const { viewport, anchorId, anchorOffsetTop } = pending;

    requestAnimationFrame(() => {
      try {
        const selector = `[data-message-id="${cssEscape(anchorId)}"]`;
        const el = viewport.querySelector<HTMLElement>(selector);

        if (el) {
          const viewportRect = viewport.getBoundingClientRect();
          const rect = el.getBoundingClientRect();
          const currentOffset = rect.top - viewportRect.top;
          const delta = currentOffset - anchorOffsetTop;

          if (delta !== 0) {
            viewport.scrollTop = viewport.scrollTop + delta;
          }
        }
      } finally {
        // Only release the lock after the fetch finished AND the final render happened.
        const current = pendingRestoreRef.current;
        const canRelease = !!current && current.stage === "done" && !isLoadingMore;

        if (canRelease) {
          pendingRestoreRef.current = null;
          restoringScrollRef.current = false;
          loadingMoreRef.current = false;
        }
      }
    });
  }, [messages, isLoadingMore]);

  // Real-time subscriptions
  useEffect(() => {
    if (!conversationId) return;

    // Helper to resolve reply_to for a message
    const resolveReplyTo = async (msg: PaginatedMessage, existingMessages: PaginatedMessage[]): Promise<PaginatedMessage> => {
      if (!msg.reply_to_message_id) return { ...msg, reply_to: null };
      
      // First check in existing messages
      const existingReply = existingMessages.find(m => m.id === msg.reply_to_message_id);
      if (existingReply) {
        return {
          ...msg,
          reply_to: {
            id: existingReply.id,
            content: existingReply.content,
            is_from_me: existingReply.is_from_me,
          }
        };
      }
      
      // Fetch from database if not found locally
      try {
        const { data: replyMsg } = await supabase
          .from("messages")
          .select("id, content, is_from_me")
          .eq("id", msg.reply_to_message_id)
          .single();
        
        if (replyMsg) {
          return {
            ...msg,
            reply_to: {
              id: replyMsg.id,
              content: replyMsg.content,
              is_from_me: replyMsg.is_from_me,
            }
          };
        }
      } catch (e) {
        console.error("Error fetching reply_to message:", e);
      }
      
      return { ...msg, reply_to: null };
    };

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
        async (payload) => {
          const rawMsg = payload.new as PaginatedMessage;

          // Helper to check if URL is a temporary blob URL
          const isBlobUrl = (url?: string | null) => url?.startsWith('blob:');
          
          // Helper to check if ID is a temporary UUID (36 chars with hyphens)
          const isTempId = (id?: string | null) => id && id.length === 36 && id.includes('-');

          setMessages(prev => {
            // Prevent duplicates by DB id
            if (prev.some(m => m.id === rawMsg.id)) return prev;

            // Prefer replacing optimistic messages by WhatsApp message id (most reliable)
            if (rawMsg.whatsapp_message_id && !isTempId(rawMsg.whatsapp_message_id)) {
              const sameWhatsappIndex = prev.findIndex(
                m => m.whatsapp_message_id && m.whatsapp_message_id === rawMsg.whatsapp_message_id
              );

              if (sameWhatsappIndex !== -1) {
                const updated = [...prev];
                const prevMsg = updated[sameWhatsappIndex];
                // Revoke old blob URL if present
                if (prevMsg.media_url && isBlobUrl(prevMsg.media_url)) {
                  try { URL.revokeObjectURL(prevMsg.media_url); } catch {}
                }
                updated[sameWhatsappIndex] = {
                  ...prevMsg,
                  ...rawMsg,
                  status: "sent",
                  // Keep local preview URL if backend hasn't stored a URL yet
                  media_url: rawMsg.media_url ?? prevMsg.media_url,
                  media_mime_type: rawMsg.media_mime_type ?? prevMsg.media_mime_type,
                  // Preserve reply_to if already resolved locally
                  reply_to: prevMsg.reply_to ?? rawMsg.reply_to,
                };
                return updated;
              }
            }

            // For media messages from me: find optimistic message with blob URL and same content
            if (rawMsg.is_from_me && rawMsg.message_type && ['image', 'audio', 'document', 'video'].includes(rawMsg.message_type)) {
              const optimisticMediaIndex = prev.findIndex(m =>
                m.is_from_me === true &&
                m.content === rawMsg.content &&
                m.message_type === rawMsg.message_type &&
                isBlobUrl(m.media_url) &&
                Math.abs(new Date(m.created_at).getTime() - new Date(rawMsg.created_at).getTime()) < 60000
              );

              if (optimisticMediaIndex !== -1) {
                const updated = [...prev];
                const prevMsg = updated[optimisticMediaIndex];
                // Revoke the old blob URL to free memory
                if (prevMsg.media_url && isBlobUrl(prevMsg.media_url)) {
                  try { URL.revokeObjectURL(prevMsg.media_url); } catch {}
                }
                updated[optimisticMediaIndex] = {
                  ...prevMsg,
                  ...rawMsg,
                  status: "sent",
                };
                return updated;
              }
            }

            // Fallback: Check for optimistic message replacement by content+timestamp
            const optimisticIndex = prev.findIndex(m =>
              m.is_from_me === rawMsg.is_from_me &&
              m.content === rawMsg.content &&
              (m.status === "sending" || m.status === "sent" || !m.whatsapp_message_id || isTempId(m.whatsapp_message_id)) &&
              Math.abs(new Date(m.created_at).getTime() - new Date(rawMsg.created_at).getTime()) < 60000
            );

            if (optimisticIndex !== -1) {
              const updated = [...prev];
              const prevMsg = updated[optimisticIndex];
              // Revoke old blob URL if present
              if (prevMsg.media_url && isBlobUrl(prevMsg.media_url)) {
                try { URL.revokeObjectURL(prevMsg.media_url); } catch {}
              }
              updated[optimisticIndex] = {
                ...prevMsg,
                ...rawMsg,
                status: "sent",
                media_url: rawMsg.media_url ?? prevMsg.media_url,
                media_mime_type: rawMsg.media_mime_type ?? prevMsg.media_mime_type,
                reply_to: prevMsg.reply_to ?? rawMsg.reply_to,
              };
              return updated;
            }

            // Last-resort duplicate guard for any message from me
            // For audio/ptt messages, we rely on message ID to prevent duplicates since
            // content is often just "audio.webm" which can match other audio messages
            if (rawMsg.is_from_me) {
              const isMediaType = rawMsg.message_type && ['audio', 'ptt', 'image', 'video', 'document'].includes(rawMsg.message_type);
              
              if (isMediaType) {
                // For media messages, only dedupe by whatsapp_message_id (already checked above)
                // or DB id (already checked at start) - don't dedupe by content
                // This allows multiple audio messages to appear correctly
              } else {
                // For text messages, check content-based deduplication
                const isDuplicate = prev.some(m =>
                  m.content === rawMsg.content &&
                  m.is_from_me === true &&
                  m.message_type === rawMsg.message_type &&
                  Math.abs(new Date(m.created_at).getTime() - new Date(rawMsg.created_at).getTime()) < 60000
                );
                if (isDuplicate) return prev;
              }
            }

            return [...prev, rawMsg];
          });

          // Resolve reply_to asynchronously and update the message
          if (rawMsg.reply_to_message_id && !rawMsg.reply_to) {
            const resolvedMsg = await resolveReplyTo(rawMsg, []);
            if (resolvedMsg.reply_to) {
              setMessages(prev => prev.map(m => 
                m.id === rawMsg.id ? { ...m, reply_to: resolvedMsg.reply_to } : m
              ));
            }
          }

          // Callback for new message (e.g., play notification)
          if (!rawMsg.is_from_me && onNewMessage) {
            onNewMessage(rawMsg);
          }
        }
      )
      .subscribe();

    // Subscribe to message updates (UPDATE) for status ticks and reconciliation
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
        async (payload) => {
          const updatedMsg = payload.new as PaginatedMessage;
          const oldMsg = payload.old as Partial<PaginatedMessage>;
          
          // Helper to check if ID is a temporary UUID (36 chars with hyphens)
          const isTempId = (id?: string | null) => id && id.length === 36 && id.includes('-');
          const isBlobUrl = (url?: string | null) => url?.startsWith('blob:');
          
          // Check if this is a temp->real ID reconciliation (from webhook updating pending message)
          const wasReconciled = oldMsg.whatsapp_message_id && 
            isTempId(oldMsg.whatsapp_message_id) && 
            updatedMsg.whatsapp_message_id && 
            !isTempId(updatedMsg.whatsapp_message_id);
          
          setMessages(prev => {
            // If reconciled, find by old temp ID or by DB id
            const targetIndex = prev.findIndex(m => 
              m.id === updatedMsg.id || 
              (wasReconciled && m.whatsapp_message_id === oldMsg.whatsapp_message_id)
            );
            
            if (targetIndex === -1) return prev;
            
            const updated = [...prev];
            const prevMsg = updated[targetIndex];
            
            // Revoke old blob URL if backend now has a real URL
            if (prevMsg.media_url && isBlobUrl(prevMsg.media_url) && updatedMsg.media_url && !isBlobUrl(updatedMsg.media_url)) {
              try { URL.revokeObjectURL(prevMsg.media_url); } catch {}
            }
            
            updated[targetIndex] = {
              ...prevMsg,
              ...updatedMsg,
              status: updatedMsg.status ?? prevMsg.status ?? "sent",
              delivered_at: updatedMsg.delivered_at ?? prevMsg.delivered_at,
              read_at: updatedMsg.read_at ?? prevMsg.read_at,
              // Keep local blob URL if backend hasn't stored yet
              media_url: updatedMsg.media_url ?? prevMsg.media_url,
              media_mime_type: updatedMsg.media_mime_type ?? prevMsg.media_mime_type,
              // Preserve reply_to
              reply_to: prevMsg.reply_to ?? updatedMsg.reply_to,
            };
            
            return updated;
          });
          
          // Resolve reply_to asynchronously if needed
          if (updatedMsg.reply_to_message_id) {
            setMessages(prev => {
              const msg = prev.find(m => m.id === updatedMsg.id);
              if (msg && !msg.reply_to) {
                // Find reply in existing messages
                const replyMsg = prev.find(m => m.id === updatedMsg.reply_to_message_id);
                if (replyMsg) {
                  return prev.map(m => m.id === updatedMsg.id ? {
                    ...m,
                    reply_to: {
                      id: replyMsg.id,
                      content: replyMsg.content,
                      is_from_me: replyMsg.is_from_me,
                    }
                  } : m);
                }
              }
              return prev;
            });
          }
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
