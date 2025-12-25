import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
} from "lucide-react";
import { MessageBubble, MessageStatus } from "@/components/conversations/MessageBubble";
import { ChatDropZone } from "@/components/conversations/ChatDropZone";
import { MessageSearch, highlightText } from "@/components/conversations/MessageSearch";
import { ReplyPreview } from "@/components/conversations/ReplyPreview";
import { TemplatePopup } from "@/components/conversations/TemplatePopup";
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
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

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
  reply_to?: {
    id: string;
    content: string | null;
    is_from_me: boolean;
  } | null;
}

export default function Conversations() {
  const { conversations, isLoading, transferHandler, updateConversation } = useConversations();
  const { departments } = useDepartments();
  const { tags } = useTags();
  const { statuses } = useCustomStatuses();
  const { templates } = useTemplates();
  const { toast } = useToast();
  const { playNotification } = useNotificationSound();
  const queryClient = useQueryClient();
  
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
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        .select("id, content, created_at, is_from_me, sender_type, ai_generated, media_url, media_mime_type, message_type, read_at, reply_to_message_id")
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

    // Subscribe to new messages
    const channel = supabase
      .channel(`messages-${selectedConversationId}`)
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
          
          // Play sound for incoming messages
          if (!newMsg.is_from_me) {
            playNotification();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversationId, playNotification]);

  // Map conversations for display
  const mappedConversations = useMemo(() => {
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
      tags: conv.tags || [],
      assignedTo: conv.assigned_profile?.full_name || null,
      whatsappInstance: conv.whatsapp_instance?.instance_name || null,
    }));
  }, [conversations, unreadCounts]);

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
        const hasMatchingTag = conv.tags.some(t => conversationFilters.tags.includes(t));
        if (!hasMatchingTag) return false;
      }

      // Tab filter
      switch (activeTab) {
        case "chat":
          return conv.handler === "human" && conv.assignedTo;
        case "ai":
          return conv.handler === "ai";
        case "queue":
          return true;
        default:
          return true;
      }
    });
  }, [mappedConversations, conversationFilters, searchQuery, activeTab]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversationId || !selectedConversation || isSending) return;
    
    const messageToSend = messageInput.trim();
    setMessageInput(""); // Clear input immediately for better UX
    setIsSending(true);
    
    // Optimistically add message to local state with "sending" status
    const tempId = crypto.randomUUID();
    const newMessage: Message = {
      id: tempId,
      content: messageToSend,
      created_at: new Date().toISOString(),
      is_from_me: true,
      sender_type: "human",
      ai_generated: false,
      status: "sending" as MessageStatus,
    };
    
    setMessages(prev => [...prev, newMessage]);
    
    try {
      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "send_message",
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

      // Update to "sent" after successful response
      setMessages(prev => prev.map(m => 
        m.id === tempId 
          ? { ...m, id: response.data.messageId || tempId, status: "sent" as MessageStatus }
          : m
      ));
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
      const newMessage: Message = {
        id: response.data.messageId || crypto.randomUUID(),
        content: `[${mediaType === "image" ? "Imagem" : mediaType === "audio" ? "Áudio" : mediaType === "video" ? "Vídeo" : "Documento"}: ${file.name}]`,
        created_at: new Date().toISOString(),
        is_from_me: true,
        sender_type: "human",
        ai_generated: false,
      };
      
      setMessages(prev => [...prev, newMessage]);
      
      toast({
        title: "Mídia enviada",
        description: `${file.name} enviado com sucesso!`,
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
    <div className="h-screen flex animate-fade-in">
      {/* Conversations List */}
      <div
        className={cn(
          "w-full md:w-96 border-r border-border bg-card flex flex-col",
          showMobileChat && "hidden md:flex"
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-border space-y-4">
          <h1 className="font-display text-xl font-bold">Atendimentos</h1>
          
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ConversationTab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="chat" className="gap-2">
                <Users className="h-4 w-4" />
                Chat
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {getTabCount("chat")}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-2">
                <Bot className="h-4 w-4" />
                IA
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {getTabCount("ai")}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="queue" className="gap-2">
                <Inbox className="h-4 w-4" />
                Fila
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
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
                    "p-3 rounded-lg cursor-pointer transition-all duration-200",
                    "hover:bg-muted",
                    selectedConversationId === conv.id && "bg-muted ring-1 ring-primary/20"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary">
                        {conv.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{conv.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {conv.time}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {conv.lastMessage}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            conv.handler === "ai"
                              ? "border-purple-500/50 text-purple-600 bg-purple-50 dark:bg-purple-900/20"
                              : "border-green-500/50 text-green-600 bg-green-50 dark:bg-green-900/20"
                          )}
                        >
                          {conv.handler === "ai" ? (
                            <Bot className="h-3 w-3 mr-1" />
                          ) : (
                            <UserCheck className="h-3 w-3 mr-1" />
                          )}
                          {conv.handler === "ai" ? "IA" : conv.assignedTo || "Humano"}
                        </Badge>
                        {conv.status && (
                          <Badge variant="outline" className="text-xs">
                            {conv.status.replace('_', ' ')}
                          </Badge>
                        )}
                        {conv.unread > 0 && (
                          <UnreadBadge count={conv.unread} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area with Drop Zone */}
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
          className={cn(
            "flex-1 flex flex-col bg-background",
            !showMobileChat && "hidden md:flex"
          )}
        >
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
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

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-3xl mx-auto">
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
                  messages.map((msg) => (
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
                        replyTo={msg.reply_to}
                        onReply={handleReply}
                        onScrollToMessage={scrollToMessage}
                        highlightText={messageSearchQuery ? (text) => highlightText(text, messageSearchQuery) : undefined}
                        isHighlighted={highlightedMessageId === msg.id}
                      />
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Reply Preview */}
            <ReplyPreview
              replyToMessage={replyToMessage}
              onCancelReply={() => setReplyToMessage(null)}
            />

            {/* Input Area */}
            <div className="p-4 border-t border-border bg-card">
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
              
              {showAudioRecorder ? (
                <div className="max-w-3xl mx-auto">
                  <AudioRecorder
                    onSend={handleSendAudioRecording}
                    onCancel={() => setShowAudioRecorder(false)}
                    disabled={isSending}
                  />
                </div>
              ) : (
                <div className="max-w-3xl mx-auto flex items-end gap-2 relative">
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
                      className="min-h-[44px] max-h-32 resize-none"
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
  );
}
