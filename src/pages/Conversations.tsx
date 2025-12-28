import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useDynamicFavicon } from "@/hooks/useDynamicFavicon";
import { useAuth } from "@/hooks/useAuth";
import {
  Bot,
  UserCheck,
  Phone,
  Send,
  Paperclip,
  MoreVertical,
  ArrowLeft,
  Image,
  FileText,
  Tag,
  Clock,
  Users,
  Inbox,
  Pencil,
  ArrowRightLeft,
  Folder,
  FileSignature,
  MessageSquare,
  Search,
  ChevronDown,
  Zap,
  MessageCircle,
  Lock,
} from "lucide-react";
import { MessageBubble, MessageStatus } from "@/components/conversations/MessageBubble";
import { ChatDropZone } from "@/components/conversations/ChatDropZone";
import { MessageSearch, highlightText } from "@/components/conversations/MessageSearch";
import { ReplyPreview } from "@/components/conversations/ReplyPreview";
import { TemplatePopup } from "@/components/conversations/TemplatePopup";
import { ContactStatusTags } from "@/components/conversations/ContactStatusTags";
import { UnreadBadge } from "@/components/conversations/UnreadBadge";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useTemplates, Template } from "@/hooks/useTemplates";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConversationFilters } from "@/components/conversations/ConversationFilters";
import { MediaPreviewDialog } from "@/components/conversations/MediaPreviewDialog";
import { AudioRecorder } from "@/components/conversations/AudioRecorder";
import { useConversations } from "@/hooks/useConversations";
import { useDepartments } from "@/hooks/useDepartments";
import { useTags } from "@/hooks/useTags";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useWhatsAppInstances } from "@/hooks/useWhatsAppInstances";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ConversationTab = "chat" | "ai" | "queue";

interface Message {
  id: string;
  content: string | null;
  created_at: string;
  is_from_me: boolean;
  sender_type: string;
  ai_generated: boolean;
  media_url?: string | null;
  media_mime_type?: string | null;
  message_type?: string;
  status?: MessageStatus;
  read_at?: string | null;
  reply_to_message_id?: string | null;
  whatsapp_message_id?: string | null;
  is_internal?: boolean;
  is_pontual?: boolean;
  reply_to?: {
    id: string;
    content: string | null;
    is_from_me: boolean;
  } | null;
}

export default function Conversations() {
  const { user } = useAuth();
  const { conversations, isLoading, transferHandler, updateConversation } = useConversations();
  const { departments } = useDepartments();
  const { tags } = useTags();
  const { statuses } = useCustomStatuses();
  const { templates } = useTemplates();
  const { instances: whatsappInstances } = useWhatsAppInstances();
  const { toast } = useToast();
  const { playNotification } = useNotificationSound();
  const queryClient = useQueryClient();

  // Filter connected instances for the selector
  const connectedInstances = useMemo(() => 
    whatsappInstances.filter(inst => inst.status === "connected"),
    [whatsappInstances]
  );
  
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [activeTab, setActiveTab] = useState<ConversationTab>("queue");
  const [signatureEnabled, setSignatureEnabled] = useState(true);
  const [editNameDialogOpen, setEditNameDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [conversationFilters, setConversationFilters] = useState<{
    statuses: string[];
    handlers: Array<'ai' | 'human'>;
    tags: string[];
    searchName: string;
    searchPhone: string;
  }>({ statuses: [], handlers: [], tags: [], searchName: '', searchPhone: '' });

  // Message search state
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [currentSearchMatch, setCurrentSearchMatch] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  
  // Reply state
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  
  // Template popup state
  const [showTemplatePopup, setShowTemplatePopup] = useState(false);
  const [templateSearchTerm, setTemplateSearchTerm] = useState("");
  
  // Unread counts state
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // New messages indicator state (when user scrolls up)
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unseenMessages, setUnseenMessages] = useState(0);
  
  // Pontual intervention mode (send message without changing handler)
  const [isPontualMode, setIsPontualMode] = useState(false);
  
  // Internal chat mode (messages only visible to team, not sent to WhatsApp)
  const [isInternalMode, setIsInternalMode] = useState(false);
  
  // Message filter (all, internal, external)
  const [messageFilter, setMessageFilter] = useState<"all" | "internal" | "external">("all");
  
  // User profile for signature
  const [userProfile, setUserProfile] = useState<{ full_name: string } | null>(null);
  
  // Internal file upload refs
  const internalFileInputRef = useRef<HTMLInputElement>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesScrollAreaRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Media preview state
  const [mediaPreview, setMediaPreview] = useState<{
    open: boolean;
    file: File | null;
    mediaType: "image" | "audio" | "video" | "document";
    previewUrl: string | null;
  }>({ open: false, file: null, mediaType: "image", previewUrl: null });

  // File input refs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const selectedConversation = useMemo(() => 
    conversations.find((c) => c.id === selectedConversationId),
    [conversations, selectedConversationId]
  );

  // Fetch user profile for signature
  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      
      if (profile) {
        setUserProfile(profile);
      }
    };
    fetchProfile();
  }, []);

  // Fetch unread counts for all conversations
  useEffect(() => {
    const fetchUnreadCounts = async () => {
      const counts: Record<string, number> = {};
      
      await Promise.all(
        conversations.map(async (conv) => {
          const { count } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .is("read_at", null)
            .eq("is_from_me", false);
          
          counts[conv.id] = count || 0;
        })
      );
      
      setUnreadCounts(counts);
    };

    if (conversations.length > 0) {
      fetchUnreadCounts();
    }
  }, [conversations]);

  // Calculate total unread for favicon and title
  const totalUnread = useMemo(() => 
    Object.values(unreadCounts).reduce((sum, count) => sum + count, 0),
    [unreadCounts]
  );

  // Dynamic favicon based on unread count
  useDynamicFavicon(totalUnread);

  // Update browser tab title with unread count
  useEffect(() => {
    const baseTitle = "Conversas";
    
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }

    // Cleanup: reset title when leaving page
    return () => {
      document.title = "FMO Advogados";
    };
  }, [totalUnread]);

  // Search matches
  const searchMatches = useMemo(() => {
    if (!messageSearchQuery.trim()) return [];
    const query = messageSearchQuery.toLowerCase();
    return messages
      .map((msg, index) => ({ msg, index }))
      .filter(({ msg }) => msg.content?.toLowerCase().includes(query))
      .map(({ msg }) => msg.id);
  }, [messages, messageSearchQuery]);

  // Scroll to message function
  const scrollToMessage = useCallback((messageId: string) => {
    const element = messageRefs.current.get(messageId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  }, []);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const root = messagesScrollAreaRef.current;
    const viewport = root?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLDivElement | null;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }, []);

  // Track whether user is at bottom; clear unseen counter when they return to bottom
  useEffect(() => {
    setUnseenMessages(0);
    setIsAtBottom(true);
    isAtBottomRef.current = true;

    const root = messagesScrollAreaRef.current;
    const viewport = root?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLDivElement | null;
    if (!viewport) return;

    const onScroll = () => {
      const atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 40;
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
      if (atBottom) setUnseenMessages(0);
    };

    viewport.addEventListener("scroll", onScroll, { passive: true } as any);
    onScroll();

    return () => viewport.removeEventListener("scroll", onScroll as any);
  }, [selectedConversationId]);

  // Handle reply
  const handleReply = useCallback((messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      setReplyToMessage(message);
    }
  }, [messages]);

  // Load messages when conversation is selected
  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      setReplyToMessage(null);
      setShowMessageSearch(false);
      setMessageSearchQuery("");
      return;
    }

    const loadMessages = async () => {
      setMessagesLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("id, content, created_at, is_from_me, sender_type, ai_generated, media_url, media_mime_type, message_type, read_at, reply_to_message_id, whatsapp_message_id")
        .eq("conversation_id", selectedConversationId)
        .order("created_at", { ascending: true });
      
      if (!error && data) {
        // Map reply_to data
        const messagesWithReplies = data.map(msg => {
          if (msg.reply_to_message_id) {
            const replyTo = data.find(m => m.id === msg.reply_to_message_id);
            return {
              ...msg,
              reply_to: replyTo ? {
                id: replyTo.id,
                content: replyTo.content,
                is_from_me: replyTo.is_from_me,
              } : null
            };
          }
          return msg;
        });
        setMessages(messagesWithReplies);
        
        // Mark messages as read
        await supabase.rpc('mark_messages_as_read', {
          _conversation_id: selectedConversationId,
          _user_id: (await supabase.auth.getUser()).data.user?.id
        });
      }
      setMessagesLoading(false);
    };

    loadMessages();

    // Subscribe to new messages (INSERT)
    const insertChannel = supabase
      .channel(`messages-insert-${selectedConversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConversationId}`
        },
        (payload) => {
          const newMsg = payload.new as Message;
          // Prevent duplicate messages - check if message already exists
          setMessages(prev => {
            const exists = prev.some(m => m.id === newMsg.id || 
              (m.content === newMsg.content && 
               m.is_from_me === newMsg.is_from_me && 
               Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 5000));
            if (exists) return prev;
            return [...prev, newMsg];
          });

          if (!newMsg.is_from_me) {
            playNotification();

            // If user is reading older messages, don't auto-pull; show indicator instead.
            if (isAtBottomRef.current) {
              requestAnimationFrame(() => scrollMessagesToBottom("auto"));
            } else {
              setUnseenMessages((c) => c + 1);
            }
          }
        }
      )
      .subscribe();

    // Subscribe to message updates (UPDATE) for real-time ticks
    const updateChannel = supabase
      .channel(`messages-update-${selectedConversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConversationId}`
        },
        (payload) => {
          const updatedMsg = payload.new as Message;
          // Update the message in state to reflect new status (read_at, etc.)
          setMessages(prev => prev.map(m => 
            m.id === updatedMsg.id 
              ? { ...m, read_at: updatedMsg.read_at }
              : m
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(insertChannel);
      supabase.removeChannel(updateChannel);
    };
  }, [selectedConversationId, playNotification]);

  // Auto-scroll to bottom when opening a conversation (after messages load)
  useEffect(() => {
    if (!selectedConversationId) return;
    if (messagesLoading) return;

    requestAnimationFrame(() => {
      scrollMessagesToBottom("auto");
    });
  }, [selectedConversationId, messagesLoading, scrollMessagesToBottom]);

  // Auto-scroll when YOU send a new message (do not force-scroll on incoming messages)
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last?.is_from_me) return;

    requestAnimationFrame(() => {
      scrollMessagesToBottom("smooth");
    });
  }, [messages, scrollMessagesToBottom]);

  // Map conversations for display with tag colors
  const mappedConversations = useMemo(() => {
    // Create a map of tag names to their colors
    const tagColorMap = tags.reduce((acc, tag) => {
      acc[tag.name] = tag.color;
      return acc;
    }, {} as Record<string, string>);

    return conversations.map(conv => ({
      id: conv.id,
      name: conv.contact_name || conv.contact_phone || "Sem nome",
      phone: conv.contact_phone || "",
      lastMessage: conv.last_message?.content || "Sem mensagens",
      time: conv.last_message_at 
        ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false, locale: ptBR })
        : "---",
      unread: unreadCounts[conv.id] || 0,
      handler: conv.current_handler as 'ai' | 'human',
      status: conv.status,
      tags: (conv.tags || []).map(tagName => ({
        name: tagName,
        color: tagColorMap[tagName] || '#6366f1'
      })),
      assignedTo: conv.assigned_profile?.full_name || null,
      whatsappInstance: conv.whatsapp_instance?.instance_name || null,
    }));
  }, [conversations, unreadCounts, tags]);

  // Filter conversations by tab and filters
  const filteredConversations = useMemo(() => {
    return mappedConversations.filter((conv) => {
      // Search filter (name or phone)
      const matchesSearch = searchQuery === '' || 
        conv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.phone.includes(searchQuery);
      
      if (!matchesSearch) return false;

      // Handler filter
      if (conversationFilters.handlers.length > 0) {
        if (!conversationFilters.handlers.includes(conv.handler)) {
          return false;
        }
      }

      // Tags filter
      if (conversationFilters.tags.length > 0) {
        const hasMatchingTag = conv.tags.some(t => conversationFilters.tags.includes(t.name));
        if (!hasMatchingTag) return false;
      }

      // Tab filter
      switch (activeTab) {
        case "chat":
          // "Meus Chats": Only show conversations assigned to current user
          return conv.handler === "human" && conv.assignedTo === user?.id;
        case "ai":
          return conv.handler === "ai";
        case "queue":
          return true;
        default:
          return true;
      }
    });
  }, [mappedConversations, conversationFilters, searchQuery, activeTab, user?.id]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversationId || !selectedConversation || isSending) return;
    
    let messageToSend = messageInput.trim();
    const wasPontualMode = isPontualMode;
    const wasInternalMode = isInternalMode;
    
    // Add signature if enabled and not internal mode
    if (signatureEnabled && userProfile?.full_name && !wasInternalMode) {
      messageToSend = `${messageToSend}\n\n— ${userProfile.full_name}`;
    }
    
    setMessageInput(""); // Clear input immediately for better UX
    setIsSending(true);
    setIsPontualMode(false); // Reset pontual mode after sending
    
    // Optimistically add message to local state with "sending" status
    const tempId = crypto.randomUUID();
    const newMessage: Message = {
      id: tempId,
      content: messageToSend,
      created_at: new Date().toISOString(),
      is_from_me: true,
      sender_type: "human",
      ai_generated: false,
      status: wasInternalMode ? "sent" as MessageStatus : "sending" as MessageStatus,
      is_internal: wasInternalMode,
      is_pontual: wasPontualMode,
    };
    
    setMessages(prev => [...prev, newMessage]);
    
    try {
      if (wasInternalMode) {
        // Internal message - save directly to database, don't send to WhatsApp
        const { error } = await supabase
          .from("messages")
          .insert({
            conversation_id: selectedConversationId,
            content: messageToSend,
            message_type: "text",
            is_from_me: true,
            sender_type: "human",
            ai_generated: false,
            is_internal: true,
          });
        
        if (error) throw error;
        
        // Update temp message to saved
        setMessages(prev => prev.map(m => 
          m.id === tempId ? { ...m, status: "sent" as MessageStatus } : m
        ));
      } else {
        // Normal message - send to WhatsApp
        // If NOT in pontual mode and handler is AI, switch to human FIRST (await!)
        if (!wasPontualMode && selectedConversation.current_handler === "ai") {
          await transferHandler.mutateAsync({
            conversationId: selectedConversationId,
            handlerType: "human",
          });
        }
        
        // Use async send for <1s response
        const response = await supabase.functions.invoke("evolution-api", {
          body: {
            action: "send_message_async",
            conversationId: selectedConversationId,
            message: messageToSend,
          },
        });

        if (response.error) {
          throw new Error(response.error.message || "Falha ao enviar mensagem");
        }

        if (!response.data?.success) {
          throw new Error(response.data?.error || "Falha ao enviar mensagem");
        }

        // Update to "sent" - message is now queued
        setMessages(prev => prev.map(m => 
          m.id === tempId 
            ? { ...m, id: response.data.messageId || tempId, status: "sent" as MessageStatus }
            : m
        ));
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      // Update message to show error status
      setMessages(prev => prev.map(m => 
        m.id === tempId 
          ? { ...m, status: "error" as MessageStatus }
          : m
      ));
      setMessageInput(messageToSend); // Restore message on error
      toast({
        title: "Erro ao enviar",
        description: error instanceof Error ? error.message : "Falha ao enviar mensagem",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };
  
  // Handle internal file upload
  const handleInternalFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedConversationId) return;
    
    event.target.value = ""; // Reset input
    setIsSending(true);
    
    try {
      // Upload file to internal-chat-files bucket
      const fileName = `${selectedConversationId}/${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("internal-chat-files")
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from("internal-chat-files")
        .getPublicUrl(fileName);
      
      // Save internal message with file
      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversationId,
          content: `📎 ${file.name}`,
          message_type: "document",
          media_url: urlData.publicUrl,
          media_mime_type: file.type,
          is_from_me: true,
          sender_type: "human",
          ai_generated: false,
          is_internal: true,
        });
      
      if (msgError) throw msgError;
      
      // Add to local state
      const newMessage: Message = {
        id: crypto.randomUUID(),
        content: `📎 ${file.name}`,
        created_at: new Date().toISOString(),
        is_from_me: true,
        sender_type: "human",
        ai_generated: false,
        message_type: "document",
        media_url: urlData.publicUrl,
        media_mime_type: file.type,
        status: "sent",
        is_internal: true,
      };
      
      setMessages(prev => [...prev, newMessage]);
    } catch (error) {
      console.error("Erro ao enviar arquivo interno:", error);
      toast({
        title: "Erro ao enviar arquivo",
        description: error instanceof Error ? error.message : "Falha ao enviar arquivo",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  // Handle retry for failed messages
  const handleRetryMessage = useCallback(async (messageId: string, content: string) => {
    if (!content || !selectedConversationId || !selectedConversation || isSending) return;

    // Update message to "sending" status
    setMessages(prev => prev.map(m => 
      m.id === messageId ? { ...m, status: "sending" as MessageStatus } : m
    ));
    
    setIsSending(true);
    
    try {
      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "send_message_async",
          conversationId: selectedConversationId,
          message: content,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Falha ao reenviar mensagem");
      }

      // Update to "sent"
      setMessages(prev => prev.map(m => 
        m.id === messageId 
          ? { ...m, id: response.data.messageId || messageId, status: "sent" as MessageStatus }
          : m
      ));
      
      toast({
        title: "Mensagem reenviada",
        description: "A mensagem foi reenviada com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao reenviar mensagem:", error);
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, status: "error" as MessageStatus } : m
      ));
      toast({
        title: "Erro ao reenviar",
        description: error instanceof Error ? error.message : "Falha ao reenviar mensagem",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  }, [selectedConversationId, selectedConversation, isSending, toast]);

  const handleSendMedia = async (file: File, mediaType: "image" | "audio" | "video" | "document") => {
    if (!selectedConversationId || !selectedConversation || isSending) return;
    
    setIsSending(true);
    
    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      
      const mediaBase64 = await base64Promise;

      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "send_media",
          conversationId: selectedConversationId,
          mediaType,
          mediaBase64,
          fileName: file.name,
          caption: "",
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Falha ao enviar mídia");
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Falha ao enviar mídia");
      }

      // Optimistically add message to local state
      // Use friendly display name for audio (remove .webm extension)
      const friendlyFileName = mediaType === "audio" ? "Mensagem de voz" : file.name;
      const newMessage: Message = {
        id: response.data.messageId || crypto.randomUUID(),
        content: `[${mediaType === "image" ? "Imagem" : mediaType === "audio" ? "Áudio" : mediaType === "video" ? "Vídeo" : "Documento"}: ${friendlyFileName}]`,
        created_at: new Date().toISOString(),
        is_from_me: true,
        sender_type: "human",
        ai_generated: false,
      };
      
      setMessages(prev => [...prev, newMessage]);
      
      toast({
        title: "Mídia enviada",
        description: mediaType === "audio" ? "Áudio enviado com sucesso!" : `${file.name} enviado com sucesso!`,
      });
    } catch (error) {
      console.error("Erro ao enviar mídia:", error);
      toast({
        title: "Erro ao enviar mídia",
        description: error instanceof Error ? error.message : "Falha ao enviar mídia",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>, mediaType: "image" | "audio" | "document") => {
    const file = event.target.files?.[0];
    if (file) {
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setMediaPreview({
        open: true,
        file,
        mediaType,
        previewUrl,
      });
    }
    // Reset input so the same file can be selected again
    event.target.value = "";
  };

  const handleMediaPreviewClose = () => {
    if (mediaPreview.previewUrl) {
      URL.revokeObjectURL(mediaPreview.previewUrl);
    }
    setMediaPreview({ open: false, file: null, mediaType: "image", previewUrl: null });
  };

  const handleMediaPreviewSend = async (caption: string) => {
    if (!mediaPreview.file) return;
    
    setIsSending(true);
    
    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(mediaPreview.file);
      
      const mediaBase64 = await base64Promise;

      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "send_media",
          conversationId: selectedConversationId,
          mediaType: mediaPreview.mediaType,
          mediaBase64,
          fileName: mediaPreview.file.name,
          caption,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Falha ao enviar mídia");
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Falha ao enviar mídia");
      }

      // Optimistically add message to local state
      const previewUrlForMessage = mediaPreview.previewUrl;
      const newMessage: Message = {
        id: response.data.messageId || crypto.randomUUID(),
        content: caption || null,
        created_at: new Date().toISOString(),
        is_from_me: true,
        sender_type: "human",
        ai_generated: false,
        media_url: previewUrlForMessage || undefined,
        media_mime_type: mediaPreview.file.type,
        message_type: mediaPreview.mediaType,
        status: "sent",
      };
      
      setMessages(prev => [...prev, newMessage]);
      handleMediaPreviewClose();
      
      toast({
        title: "Mídia enviada",
        description: `${mediaPreview.file.name} enviado com sucesso!`,
      });
    } catch (error) {
      console.error("Erro ao enviar mídia:", error);
      toast({
        title: "Erro ao enviar mídia",
        description: error instanceof Error ? error.message : "Falha ao enviar mídia",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendAudioRecording = async (audioBlob: Blob) => {
    if (!selectedConversationId || isSending) return;
    
    setIsSending(true);
    
    try {
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(audioBlob);
      
      const mediaBase64 = await base64Promise;

      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "send_media",
          conversationId: selectedConversationId,
          mediaType: "audio",
          mediaBase64,
          fileName: "audio.webm",
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Falha ao enviar áudio");
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Falha ao enviar áudio");
      }

      // Optimistically add message to local state
      const newMessage: Message = {
        id: response.data.messageId || crypto.randomUUID(),
        content: null,
        created_at: new Date().toISOString(),
        is_from_me: true,
        sender_type: "human",
        ai_generated: false,
        message_type: "audio",
        status: "sent",
      };
      
      setMessages(prev => [...prev, newMessage]);
      setShowAudioRecorder(false);
      
      toast({
        title: "Áudio enviado",
        description: "Áudio enviado com sucesso!",
      });
    } catch (error) {
      console.error("Erro ao enviar áudio:", error);
      toast({
        title: "Erro ao enviar áudio",
        description: error instanceof Error ? error.message : "Falha ao enviar áudio",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setShowMobileChat(true);
  };

  const handleUpdateName = async () => {
    if (selectedConversation && editingName.trim()) {
      updateConversation.mutate({
        id: selectedConversation.id,
        contact_name: editingName,
      });
      setEditNameDialogOpen(false);
    }
  };

  const handleTransferHandler = (handler: "ai" | "human") => {
    if (selectedConversation) {
      transferHandler.mutate({
        conversationId: selectedConversation.id,
        handlerType: handler,
      });
    }
  };

  const getTabCount = (tab: ConversationTab) => {
    switch (tab) {
      case "chat":
        return mappedConversations.filter(c => c.handler === "human" && c.assignedTo).length;
      case "ai":
        return mappedConversations.filter(c => c.handler === "ai").length;
      case "queue":
        return mappedConversations.length;
    }
  };

  const openEditName = () => {
    if (selectedConversation) {
      setEditingName(selectedConversation.contact_name || "");
      setEditNameDialogOpen(true);
    }
  };

  // Get available statuses for filters
  const availableStatuses = useMemo(() => {
    return statuses.map(s => ({ id: s.id, name: s.name, color: s.color }));
  }, [statuses]);

  // Get available tags for filters
  const availableTags = useMemo(() => {
    return tags.map(t => ({ id: t.id, name: t.name, color: t.color }));
  }, [tags]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div className="h-[calc(100vh-64px)] flex overflow-hidden min-h-0">
      {/* Mobile: show list or chat */}
      <div className={cn("md:hidden w-full", showMobileChat && "hidden")}>
        <div className="h-full flex flex-col bg-card">
          {/* Mobile Header */}
          <div className="p-3 border-b border-border space-y-3">
            <h1 className="font-display text-lg font-bold">Atendimentos</h1>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ConversationTab)}>
              <TabsList className="grid w-full grid-cols-3 h-8">
                <TabsTrigger value="chat" className="gap-1 text-xs h-7">
                  <Users className="h-3 w-3" />
                  Chat
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {getTabCount("chat")}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="ai" className="gap-1 text-xs h-7">
                  <Bot className="h-3 w-3" />
                  IA
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {getTabCount("ai")}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="queue" className="gap-1 text-xs h-7">
                  <Inbox className="h-3 w-3" />
                  Fila
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {getTabCount("queue")}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <ConversationFilters
              filters={conversationFilters}
              onFiltersChange={setConversationFilters}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              availableStatuses={availableStatuses}
              availableTags={availableTags}
            />
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filteredConversations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {conversations.length === 0 ? "Nenhuma conversa ainda" : "Nenhuma conversa encontrada"}
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={cn(
                      "p-2 rounded-lg cursor-pointer transition-all duration-200 hover:bg-muted",
                      selectedConversationId === conv.id && "bg-muted ring-1 ring-primary/20"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {conv.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-medium truncate">{conv.name}</span>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">{conv.time}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">{conv.phone}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] h-5 px-1.5",
                              conv.handler === "ai"
                                ? "border-purple-500/50 text-purple-600 bg-purple-50 dark:bg-purple-900/20"
                                : "border-green-500/50 text-green-600 bg-green-50 dark:bg-green-900/20"
                            )}
                          >
                            {conv.handler === "ai" ? <Bot className="h-2.5 w-2.5 mr-0.5" /> : <UserCheck className="h-2.5 w-2.5 mr-0.5" />}
                            {conv.handler === "ai" ? "IA" : (conv.assignedTo?.split(" ")[0] || "Humano")}
                          </Badge>
                          {conv.status && (
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                              {conv.status.replace(/_/g, ' ')}
                            </Badge>
                          )}
                          {conv.tags.slice(0, 2).map((tag, i) => (
                            <Tooltip key={i}>
                              <TooltipTrigger asChild>
                                <Badge 
                                  variant="outline" 
                                  className="text-[10px] h-5 px-1.5 truncate max-w-[60px] cursor-default"
                                  style={{ 
                                    borderColor: tag.color, 
                                    backgroundColor: `${tag.color}20`,
                                    color: tag.color 
                                  }}
                                >
                                  {tag.name}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{tag.name}</p>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                          {conv.unread > 0 && <UnreadBadge count={conv.unread} />}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Mobile: Chat view */}
      <div className={cn("md:hidden w-full h-full", !showMobileChat && "hidden")}>
        <ChatDropZone
          onFileDrop={(file, mediaType) => {
            const previewUrl = URL.createObjectURL(file);
            setMediaPreview({ open: true, file, mediaType, previewUrl });
          }}
          disabled={isSending || !selectedConversation}
        >
          <div className="flex flex-col bg-background h-full min-h-0 overflow-hidden">
            {selectedConversation ? (
              <>
                {/* Mobile Chat Header */}
                <div className="p-4 border-b border-border flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowMobileChat(false)}
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">
                        {(selectedConversation.contact_name || selectedConversation.contact_phone || "?")
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">
                        {selectedConversation.contact_name || selectedConversation.contact_phone || "Sem nome"}
                      </p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {selectedConversation.contact_phone || "---"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mobile Messages */}
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-4 space-y-4">
                    {messagesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Nenhuma mensagem ainda</p>
                      </div>
                    ) : (
                      messages
                        .filter((msg) => {
                          if (messageFilter === "all") return true;
                          if (messageFilter === "external") return !msg.is_internal;
                          if (messageFilter === "internal") return msg.is_internal;
                          return true;
                        })
                        .map((msg) => (
                          <MessageBubble
                            key={msg.id}
                            id={msg.id}
                            content={msg.content}
                            createdAt={msg.created_at}
                            isFromMe={msg.is_from_me}
                            senderType={msg.sender_type}
                            aiGenerated={msg.ai_generated}
                            mediaUrl={msg.media_url}
                            mediaMimeType={msg.media_mime_type}
                            messageType={msg.message_type}
                            status={msg.status || "sent"}
                            readAt={msg.read_at}
                            whatsappMessageId={msg.whatsapp_message_id}
                            conversationId={selectedConversationId || undefined}
                            replyTo={msg.reply_to}
                            isInternal={msg.is_internal}
                            isPontual={msg.is_pontual}
                            onReply={handleReply}
                            onScrollToMessage={scrollToMessage}
                            onRetry={handleRetryMessage}
                          />
                        ))
                    )}
                  </div>
                </ScrollArea>

                {/* Mobile Input */}
                <div className="flex-shrink-0 p-4 border-t border-border bg-card">
                  <div className="flex items-end gap-2">
                    <Textarea
                      placeholder="Digite sua mensagem..."
                      className="min-h-[44px] max-h-[120px] resize-none"
                      rows={1}
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      disabled={isSending}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                    <Button 
                      size="icon" 
                      onClick={handleSendMessage}
                      disabled={isSending || !messageInput.trim()}
                    >
                      {isSending ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Selecione uma conversa para começar</p>
                </div>
              </div>
            )}
          </div>
        </ChatDropZone>
      </div>

      <ResizablePanelGroup direction="horizontal" className="hidden md:flex h-full">
        {/* Conversations List Panel */}
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40} className="bg-card flex flex-col min-h-0">
        {/* Header */}
        <div className="p-3 border-b border-border space-y-3">
          <h1 className="font-display text-lg font-bold">Atendimentos</h1>
          
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ConversationTab)}>
            <TabsList className="grid w-full grid-cols-3 h-8">
              <TabsTrigger value="chat" className="gap-1 text-xs h-7">
                <Users className="h-3 w-3" />
                Chat
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {getTabCount("chat")}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-1 text-xs h-7">
                <Bot className="h-3 w-3" />
                IA
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {getTabCount("ai")}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="queue" className="gap-1 text-xs h-7">
                <Inbox className="h-3 w-3" />
                Fila
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {getTabCount("queue")}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <ConversationFilters
            filters={conversationFilters}
            onFiltersChange={setConversationFilters}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            availableStatuses={availableStatuses}
            availableTags={availableTags}
          />
        </div>

        {/* Conversation List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {conversations.length === 0 
                    ? "Nenhuma conversa ainda" 
                    : "Nenhuma conversa encontrada"
                  }
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={cn(
                    "p-2 rounded-lg cursor-pointer transition-all duration-200 hover:bg-muted",
                    selectedConversationId === conv.id && "bg-muted ring-1 ring-primary/20"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-primary">
                        {conv.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-medium truncate">{conv.name}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{conv.time}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{conv.phone}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] h-5 px-1.5",
                            conv.handler === "ai"
                              ? "border-purple-500/50 text-purple-600 bg-purple-50 dark:bg-purple-900/20"
                              : "border-green-500/50 text-green-600 bg-green-50 dark:bg-green-900/20"
                          )}
                        >
                          {conv.handler === "ai" ? <Bot className="h-2.5 w-2.5 mr-0.5" /> : <UserCheck className="h-2.5 w-2.5 mr-0.5" />}
                          {conv.handler === "ai" ? "IA" : (conv.assignedTo?.split(" ")[0] || "Humano")}
                        </Badge>
                        {conv.status && (
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                            {conv.status.replace(/_/g, ' ')}
                          </Badge>
                        )}
                        {conv.tags.slice(0, 2).map((tag, i) => (
                          <Tooltip key={i}>
                            <TooltipTrigger asChild>
                              <Badge 
                                variant="outline" 
                                className="text-[10px] h-5 px-1.5 truncate max-w-[60px] cursor-default"
                                style={{ 
                                  borderColor: tag.color, 
                                  backgroundColor: `${tag.color}20`,
                                  color: tag.color 
                                }}
                              >
                                {tag.name}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{tag.name}</p>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                        {conv.unread > 0 && <UnreadBadge count={conv.unread} />}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Chat Area Panel */}
        <ResizablePanel defaultSize={75} minSize={50} className="flex flex-col min-h-0 min-w-0">
          <ChatDropZone
            onFileDrop={(file, mediaType) => {
              const previewUrl = URL.createObjectURL(file);
              setMediaPreview({
                open: true,
                file,
                mediaType,
                previewUrl,
          });
        }}
        disabled={isSending || !selectedConversation}
      >
        <div
          className="flex-1 flex flex-col bg-background min-h-0 min-w-0 overflow-hidden h-full"
        >
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setShowMobileChat(false)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-semibold text-primary">
                    {(selectedConversation.contact_name || selectedConversation.contact_phone || "?")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {selectedConversation.contact_name || selectedConversation.contact_phone || "Sem nome"}
                    </p>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openEditName}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {selectedConversation.contact_phone || "---"}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <Inbox className="h-3 w-3 text-muted-foreground" />
                    {connectedInstances.length > 1 ? (
                      <Select
                        value={selectedConversation.whatsapp_instance_id || ""}
                        onValueChange={(value) => {
                          if (value && selectedConversation?.id) {
                            updateConversation.mutate({
                              id: selectedConversation.id,
                              whatsapp_instance_id: value,
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="h-6 text-xs border-none p-0 pl-1 bg-transparent w-auto min-w-[140px]">
                          <SelectValue placeholder="Selecione um canal" />
                        </SelectTrigger>
                        <SelectContent>
                          {whatsappInstances.map((inst) => {
                            const lastDigits = inst.phone_number ? inst.phone_number.slice(-4) : null;
                            const isConnected = inst.status === "connected";
                            return (
                              <SelectItem key={inst.id} value={inst.id} className="text-xs">
                                <span className="flex items-center gap-2">
                                  <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                                  {inst.instance_name}
                                  {lastDigits && <span className="text-muted-foreground">(...{lastDigits})</span>}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Canal: {selectedConversation.whatsapp_instance?.instance_name || connectedInstances[0]?.instance_name || "Não vinculado"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Transfer Handler */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Transferir
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56" align="end">
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Transferir para</h4>
                      <div className="space-y-2">
                        <Button 
                          variant={selectedConversation.current_handler === "ai" ? "default" : "outline"}
                          size="sm" 
                          className="w-full justify-start"
                          onClick={() => handleTransferHandler("ai")}
                        >
                          <Bot className="h-4 w-4 mr-2" />
                          IA
                        </Button>
                        <Button 
                          variant={selectedConversation.current_handler === "human" ? "default" : "outline"}
                          size="sm" 
                          className="w-full justify-start"
                          onClick={() => handleTransferHandler("human")}
                        >
                          <UserCheck className="h-4 w-4 mr-2" />
                          Humano
                        </Button>
                      </div>
                      {departments.length > 0 && (
                        <div className="pt-2 border-t">
                          <h5 className="text-xs text-muted-foreground mb-2">Departamento</h5>
                          {departments.map(dept => (
                            <Button
                              key={dept.id}
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start mb-1"
                            >
                              <Folder className="h-4 w-4 mr-2" style={{ color: dept.color }} />
                              {dept.name}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Signature Toggle */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/50">
                  <FileSignature className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="signature" className="text-xs cursor-pointer">Assinatura</Label>
                  <Switch
                    id="signature"
                    checked={signatureEnabled}
                    onCheckedChange={setSignatureEnabled}
                  />
                </div>

                <Badge
                  variant="outline"
                  className={cn(
                    selectedConversation.current_handler === "ai"
                      ? "border-purple-500 text-purple-600"
                      : "border-green-500 text-green-600"
                  )}
                >
                  {selectedConversation.current_handler === "ai" ? "🤖 IA" : "⚖️ Advogado"}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={openEditName}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar nome
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowMessageSearch(true)}>
                      <Search className="h-4 w-4 mr-2" />
                      Buscar mensagens
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Tag className="h-4 w-4 mr-2" />
                      Adicionar tag
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Clock className="h-4 w-4 mr-2" />
                      Ver histórico
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              </div>
              {/* Contact Status and Tags */}
              <ContactStatusTags
                clientId={selectedConversation.client_id}
                conversationId={selectedConversation.id}
                contactPhone={selectedConversation.contact_phone}
                contactName={selectedConversation.contact_name}
              />
            </div>

            {/* Message Search Bar */}
            <MessageSearch
              isOpen={showMessageSearch}
              onClose={() => { setShowMessageSearch(false); setMessageSearchQuery(""); }}
              searchQuery={messageSearchQuery}
              onSearchChange={setMessageSearchQuery}
              matchCount={searchMatches.length}
              currentMatch={currentSearchMatch}
              onPrevMatch={() => {
                if (searchMatches.length > 0) {
                  const newIndex = (currentSearchMatch - 1 + searchMatches.length) % searchMatches.length;
                  setCurrentSearchMatch(newIndex);
                  scrollToMessage(searchMatches[newIndex]);
                }
              }}
              onNextMatch={() => {
                if (searchMatches.length > 0) {
                  const newIndex = (currentSearchMatch + 1) % searchMatches.length;
                  setCurrentSearchMatch(newIndex);
                  scrollToMessage(searchMatches[newIndex]);
                }
              }}
            />

            {/* Message Filter Tabs */}
            <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Mostrar:</span>
              <div className="flex gap-1">
                <Button
                  variant={messageFilter === "all" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setMessageFilter("all")}
                >
                  Todas
                </Button>
                <Button
                  variant={messageFilter === "external" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setMessageFilter("external")}
                >
                  Cliente
                </Button>
                <Button
                  variant={messageFilter === "internal" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 text-xs text-yellow-600"
                  onClick={() => setMessageFilter("internal")}
                >
                  <Lock className="h-3 w-3 mr-1" />
                  Interna
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="relative flex-1 min-h-0">
              <ScrollArea ref={messagesScrollAreaRef} className="h-full">
                <div className="p-4 space-y-4 max-w-4xl mx-auto px-4 lg:px-8">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : messages.filter(m => {
                    if (messageFilter === "all") return true;
                    if (messageFilter === "internal") return m.is_internal === true;
                    if (messageFilter === "external") return !m.is_internal;
                    return true;
                  }).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{messageFilter === "internal" ? "Nenhuma mensagem interna" : messageFilter === "external" ? "Nenhuma mensagem externa" : "Nenhuma mensagem ainda"}</p>
                    </div>
                  ) : (
                    messages
                      .filter(m => {
                        if (messageFilter === "all") return true;
                        if (messageFilter === "internal") return m.is_internal === true;
                        if (messageFilter === "external") return !m.is_internal;
                        return true;
                      })
                      .map((msg) => (
                      <div key={msg.id} ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}>
                        <MessageBubble
                          id={msg.id}
                          content={msg.content}
                          createdAt={msg.created_at}
                          isFromMe={msg.is_from_me}
                          senderType={msg.sender_type}
                          aiGenerated={msg.ai_generated}
                          mediaUrl={msg.media_url}
                          mediaMimeType={msg.media_mime_type}
                          messageType={msg.message_type}
                          status={msg.status || "sent"}
                          readAt={msg.read_at}
                          whatsappMessageId={msg.whatsapp_message_id}
                          conversationId={selectedConversationId || undefined}
                          replyTo={msg.reply_to}
                          isInternal={msg.is_internal}
                          isPontual={msg.is_pontual}
                          onReply={handleReply}
                          onScrollToMessage={scrollToMessage}
                          onRetry={handleRetryMessage}
                          highlightText={messageSearchQuery ? (text) => highlightText(text, messageSearchQuery) : undefined}
                          isHighlighted={highlightedMessageId === msg.id}
                        />
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {!isAtBottom && unseenMessages > 0 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shadow-sm"
                    onClick={() => {
                      setUnseenMessages(0);
                      scrollMessagesToBottom("smooth");
                    }}
                  >
                    <ChevronDown className="h-4 w-4 mr-2" />
                    {unseenMessages} nova{unseenMessages > 1 ? "s" : ""} mensagem{unseenMessages > 1 ? "s" : ""} · Voltar ao fim
                  </Button>
                </div>
              )}
            </div>

            {/* Reply Preview */}
            <ReplyPreview
              replyToMessage={replyToMessage}
              onCancelReply={() => setReplyToMessage(null)}
            />

            {/* Input Area */}
            <div className={cn(
              "flex-shrink-0 p-4 border-t border-border bg-card",
              isPontualMode && "border-t-2 border-t-amber-500",
              isInternalMode && "border-t-2 border-t-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10"
            )}>
              {/* Pontual Mode Indicator */}
              {isPontualMode && (
                <div className="max-w-4xl mx-auto mb-2 flex items-center justify-between bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-md text-sm">
                  <span className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Modo intervenção pontual - a IA continuará respondendo após esta mensagem
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                    onClick={() => setIsPontualMode(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
              
              {/* Internal Mode Indicator */}
              {isInternalMode && (
                <div className="max-w-4xl mx-auto mb-2 flex items-center justify-between bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 px-3 py-1.5 rounded-md text-sm">
                  <span className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Conversa interna - apenas a equipe pode ver estas mensagens
                  </span>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 text-xs text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
                      onClick={() => internalFileInputRef.current?.click()}
                    >
                      <Paperclip className="h-3 w-3 mr-1" />
                      Arquivo
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 text-xs text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
                      onClick={() => setIsInternalMode(false)}
                    >
                      Sair
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Hidden file inputs */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e, "image")}
              />
              <input
                ref={documentInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                className="hidden"
                onChange={(e) => handleFileSelect(e, "document")}
              />
              <input
                ref={internalFileInputRef}
                type="file"
                className="hidden"
                onChange={handleInternalFileUpload}
              />
              
              {showAudioRecorder ? (
                <div className="max-w-4xl mx-auto px-4 lg:px-8">
                  <AudioRecorder
                    onSend={handleSendAudioRecording}
                    onCancel={() => setShowAudioRecorder(false)}
                    disabled={isSending}
                  />
                </div>
              ) : (
                <div className="max-w-4xl mx-auto px-4 lg:px-8 flex items-end gap-2 relative">
                  {/* Internal Chat Toggle Button */}
                  <Button
                    variant={isInternalMode ? "default" : "ghost"}
                    size="icon"
                    className={cn(
                      isInternalMode 
                        ? "bg-yellow-500 hover:bg-yellow-600 text-white" 
                        : "text-muted-foreground hover:text-yellow-500"
                    )}
                    onClick={() => {
                      setIsInternalMode(!isInternalMode);
                      setIsPontualMode(false); // Disable pontual when switching to internal
                    }}
                    title="Conversa interna - apenas equipe pode ver"
                  >
                    <MessageCircle className="h-5 w-5" />
                  </Button>
                  
                  {/* Pontual Intervention Button - Show when handler is AI and NOT in internal mode */}
                  {selectedConversation?.current_handler === "ai" && !isInternalMode && (
                    <Button
                      variant={isPontualMode ? "default" : "ghost"}
                      size="icon"
                      className={cn(
                        isPontualMode 
                          ? "bg-amber-500 hover:bg-amber-600 text-white" 
                          : "text-muted-foreground hover:text-amber-500"
                      )}
                      onClick={() => setIsPontualMode(!isPontualMode)}
                      title="Intervenção pontual - enviar mensagem sem tirar da IA"
                    >
                      <Zap className="h-5 w-5" />
                    </Button>
                  )}
                  
                  {/* File buttons - hide when in internal mode (use the button in the indicator instead) */}
                  {!isInternalMode && (
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-muted-foreground"
                        onClick={() => documentInputRef.current?.click()}
                        disabled={isSending}
                        title="Enviar documento"
                      >
                        <Paperclip className="h-5 w-5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-muted-foreground"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={isSending}
                        title="Enviar imagem"
                      >
                        <Image className="h-5 w-5" />
                      </Button>
                    </div>
                  )}
                  <div className="flex-1 relative">
                    <TemplatePopup
                      isOpen={showTemplatePopup}
                      templates={templates.filter(t => t.is_active)}
                      searchTerm={templateSearchTerm}
                      onSelect={(template: Template) => {
                        setMessageInput(template.content);
                        setShowTemplatePopup(false);
                        setTemplateSearchTerm("");
                        textareaRef.current?.focus();
                      }}
                      onClose={() => {
                        setShowTemplatePopup(false);
                        setTemplateSearchTerm("");
                      }}
                    />
                    <Textarea
                      ref={textareaRef}
                      placeholder={isSending ? "Enviando..." : "Digite / para templates..."}
                      className="min-h-[44px] max-h-[160px] resize-none overflow-y-auto"
                      rows={1}
                      value={messageInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        setMessageInput(value);
                        
                        // Handle template popup
                        if (value.startsWith("/")) {
                          setShowTemplatePopup(true);
                          setTemplateSearchTerm(value.slice(1));
                        } else {
                          setShowTemplatePopup(false);
                          setTemplateSearchTerm("");
                        }
                      }}
                      disabled={isSending}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !showTemplatePopup) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                        if (e.key === "Escape" && showTemplatePopup) {
                          setShowTemplatePopup(false);
                          setTemplateSearchTerm("");
                        }
                      }}
                    />
                  </div>
                  <div className="flex gap-1">
                    <AudioRecorder
                      onSend={handleSendAudioRecording}
                      onCancel={() => {}}
                      disabled={isSending}
                    />
                    <Button 
                      size="icon" 
                      onClick={handleSendMessage}
                      disabled={isSending || !messageInput.trim()}
                    >
                      {isSending ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Selecione uma conversa para começar</p>
            </div>
          </div>
        )}
        </div>
          </ChatDropZone>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Edit Name Dialog */}
      <Dialog open={editNameDialogOpen} onOpenChange={setEditNameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Nome</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              placeholder="Nome do contato"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditNameDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateName}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Media Preview Dialog */}
      <MediaPreviewDialog
        open={mediaPreview.open}
        onClose={handleMediaPreviewClose}
        onSend={handleMediaPreviewSend}
        file={mediaPreview.file}
        mediaType={mediaPreview.mediaType}
        previewUrl={mediaPreview.previewUrl}
        isSending={isSending}
      />
    </div>
    </TooltipProvider>
  );
}
