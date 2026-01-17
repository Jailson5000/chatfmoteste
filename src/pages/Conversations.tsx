import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useMessagesWithPagination, PaginatedMessage } from "@/hooks/useMessagesWithPagination";
import { useMessageQueue } from "@/hooks/useMessageQueue";
import { useSearchParams } from "react-router-dom";
import { useDynamicFavicon } from "@/hooks/useDynamicFavicon";
import { useAuth } from "@/hooks/useAuth";
import {
  Bot,
  UserCheck,
  Phone,
  Send,
  Paperclip,
  MoreVertical,
  Archive,
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
  ChevronRight,
  Zap,
  MessageCircle,
  Lock,
  User,
  UserX,
  PanelRightOpen,
  PanelRightClose,
  Plus,
  Smile,
  Sparkles,
  Volume2,
  Filter,
  WifiOff,
  ExternalLink,
} from "lucide-react";
import MessageBubble, { MessageStatus } from "@/components/conversations/MessageBubble";
import { ChatDropZone } from "@/components/conversations/ChatDropZone";
import { MessageSearch, highlightText } from "@/components/conversations/MessageSearch";
import { ReplyPreview } from "@/components/conversations/ReplyPreview";
import { TemplatePopup } from "@/components/conversations/TemplatePopup";
import { ContactStatusTags } from "@/components/conversations/ContactStatusTags";
import { UnreadBadge } from "@/components/conversations/UnreadBadge";
import { InlineActivityBadge, ActivityItem } from "@/components/conversations/InlineActivityBadge";
import { DateSeparator, shouldShowDateSeparator } from "@/components/conversations/DateSeparator";
import { useInlineActivities } from "@/hooks/useInlineActivities";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useTemplates, Template } from "@/hooks/useTemplates";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { AdvancedFiltersSheet } from "@/components/conversations/AdvancedFiltersSheet";
import { MediaPreviewDialog } from "@/components/conversations/MediaPreviewDialog";
import { ContactDetailsPanel } from "@/components/conversations/ContactDetailsPanel";
import { ConversationSidebarCard } from "@/components/conversations/ConversationSidebarCard";
import { AudioRecorder } from "@/components/conversations/AudioRecorder";
import { AudioModeIndicator } from "@/components/conversations/AudioModeIndicator";
import { useConversations } from "@/hooks/useConversations";
import { useConversationCounts } from "@/hooks/useConversationCounts";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useDepartments } from "@/hooks/useDepartments";
import { useTags } from "@/hooks/useTags";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useClients } from "@/hooks/useClients";
import { AIProviderBadge } from "@/components/ai/AIProviderBadge";
import { useWhatsAppInstances } from "@/hooks/useWhatsAppInstances";
import { useAutomations } from "@/hooks/useAutomations";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useScheduledFollowUps } from "@/hooks/useScheduledFollowUps";
import { ScheduledFollowUpIndicator } from "@/components/conversations/ScheduledFollowUpIndicator";
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

type ConversationTab = "chat" | "ai" | "queue" | "all" | "archived";

// Archive reason options
const ARCHIVE_REASONS = [
  { value: "resolved", label: "Chat do cliente resolvido com sucesso." },
  { value: "no_response", label: "Cliente não responde mais." },
  { value: "opened_by_mistake", label: "Abri sem querer." },
  { value: "other", label: "Outros." },
] as const;

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
  delivered_at?: string | null;
  read_at?: string | null;
  reply_to_message_id?: string | null;
  whatsapp_message_id?: string | null;
  is_internal?: boolean;
  is_pontual?: boolean;
  is_revoked?: boolean;
  ai_agent_id?: string | null;
  ai_agent_name?: string | null;
  reply_to?: {
    id: string;
    content: string | null;
    is_from_me: boolean;
  } | null;
  // Client-side fields for stable ordering during optimistic updates
  _clientOrder?: number;
  _clientTempId?: string;
}

export default function Conversations() {
  const { user } = useAuth();
  const { 
    conversations, 
    isLoading, 
    transferHandler, 
    updateConversation, 
    updateConversationDepartment, 
    updateConversationTags, 
    updateClientStatus, 
    updateConversationAudioMode,
    changeWhatsAppInstance,
    checkExistingConversationInDestination,
    loadMoreConversations: loadMoreFromBackend,
    hasMoreConversations: hasMoreFromBackend,
    isLoadingMoreConversations: isLoadingMoreFromBackend,
  } = useConversations();
  const { counts: tabCounts } = useConversationCounts();
  const { members: teamMembers } = useTeamMembers();
  const { departments } = useDepartments();
  const { tags } = useTags();
  const { statuses } = useCustomStatuses();
  const { updateClient } = useClients();
  const { templates } = useTemplates();
  const { instances: whatsappInstances } = useWhatsAppInstances();
  const { automations } = useAutomations();
  const { toast } = useToast();
  const { playNotification } = useNotificationSound();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { lawFirm } = useLawFirm();
  const { followUpsByConversation } = useScheduledFollowUps();
  
  // Message queue to ensure messages are sent in strict order
  const { enqueue: enqueueMessage, clearQueue: clearMessageQueue } = useMessageQueue();

  // Filter connected instances for the selector
  const connectedInstances = useMemo(() => 
    whatsappInstances.filter(inst => inst.status === "connected"),
    [whatsappInstances]
  );

  // Get active voice config from active automation (global permission)
  const globalVoiceConfig = useMemo(() => {
    const activeAutomation = automations.find(a => a.is_active);
    if (!activeAutomation?.trigger_config) return null;
    const config = activeAutomation.trigger_config;
    if (config.voice_enabled) {
      return {
        enabled: true,
        voiceId: config.voice_id || undefined,
      };
    }
    return null;
  }, [automations]);
  
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [newlyCreatedConversation, setNewlyCreatedConversation] = useState<any | null>(null);
  
  // Paginated messages with infinite scroll (load older messages on scroll up)
  const {
    messages,
    setMessages,
    isLoading: messagesLoading,
    isLoadingMore: messagesLoadingMore,
    hasMoreMessages,
    handleScrollToTop: handleMessagesScrollToTop,
  } = useMessagesWithPagination({
    conversationId: selectedConversationId,
    initialBatchSize: 35,
    loadMoreBatchSize: 30,
    onNewMessage: () => playNotification(),
  });

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
    handlers: Array<'ai' | 'human' | 'unassigned'>;
    tags: string[];
    departments: string[];
    searchName: string;
    searchPhone: string;
  }>({ statuses: [], handlers: [], tags: [], departments: [], searchName: '', searchPhone: '' });
  
  // Filter toggle functions
  const toggleStatusFilter = (statusId: string) => {
    const newStatuses = conversationFilters.statuses.includes(statusId)
      ? conversationFilters.statuses.filter(s => s !== statusId)
      : [...conversationFilters.statuses, statusId];
    setConversationFilters({ ...conversationFilters, statuses: newStatuses });
  };

  const toggleHandlerFilter = (handler: 'ai' | 'human' | 'unassigned') => {
    const newHandlers = conversationFilters.handlers.includes(handler)
      ? conversationFilters.handlers.filter(h => h !== handler)
      : [...conversationFilters.handlers, handler];
    setConversationFilters({ ...conversationFilters, handlers: newHandlers });
  };

  const toggleTagFilter = (tagId: string) => {
    const newTags = conversationFilters.tags.includes(tagId)
      ? conversationFilters.tags.filter(t => t !== tagId)
      : [...conversationFilters.tags, tagId];
    setConversationFilters({ ...conversationFilters, tags: newTags });
  };

  const toggleDepartmentFilter = (deptId: string) => {
    const newDepartments = conversationFilters.departments.includes(deptId)
      ? conversationFilters.departments.filter(d => d !== deptId)
      : [...conversationFilters.departments, deptId];
    setConversationFilters({ ...conversationFilters, departments: newDepartments });
  };

  const clearAllFilters = () => {
    setConversationFilters({ statuses: [], handlers: [], tags: [], departments: [], searchName: '', searchPhone: '' });
    setSearchQuery('');
  };

  const activeFiltersCount = 
    conversationFilters.statuses.length + 
    conversationFilters.handlers.length + 
    conversationFilters.tags.length +
    conversationFilters.departments.length;
  // Get inline activities for the selected conversation (after selectedConversationId is declared)
  const { activities: inlineActivities } = useInlineActivities(
    selectedConversationId,
    conversations.find(c => c.id === selectedConversationId)?.client_id || null
  );

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
  
  // Note: unread counts now come directly from RPC (conv.unread_count) - no separate state needed

  // New messages indicator state (when user scrolls up)
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unseenMessages, setUnseenMessages] = useState(0);
  
  // Pontual intervention mode (send message without changing handler)
  const [isPontualMode, setIsPontualMode] = useState(false);
  
  // Internal chat mode (messages only visible to team, not sent to WhatsApp)
  const [isInternalMode, setIsInternalMode] = useState(false);

  // Archive dialog state
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState<string>("resolved");
  const [archiveCustomReason, setArchiveCustomReason] = useState<string>("");
  const [archiveNextResponsible, setArchiveNextResponsible] = useState<string | null>(null);
  const [archiveNextResponsibleType, setArchiveNextResponsibleType] = useState<"human" | "ai" | null>(null);

  // Instance change confirmation dialog state
  const [instanceChangeDialogOpen, setInstanceChangeDialogOpen] = useState(false);
  const [pendingInstanceChange, setPendingInstanceChange] = useState<{
    conversationId: string;
    newInstanceId: string;
    oldInstanceName: string;
    newInstanceName: string;
    oldPhoneDigits?: string;
    newPhoneDigits?: string;
    existingConvName?: string;
  } | null>(null);

  // Details panel state
  const [showDetailsPanel, setShowDetailsPanel] = useState(true);
  
  // More filters popover state
  const [filtersPopoverOpen, setFiltersPopoverOpen] = useState(false);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [handlerFilterOpen, setHandlerFilterOpen] = useState(false);
  const [tagFilterOpen, setTagFilterOpen] = useState(false);
  const [departmentFilterOpen, setDepartmentFilterOpen] = useState(false);
  
  // Summary generation state
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
  const [generatedSummary, setGeneratedSummary] = useState("");
  
  // User profile for signature
  const [userProfile, setUserProfile] = useState<{ full_name: string; job_title: string | null } | null>(null);
  
  // Internal file upload refs
  const internalFileInputRef = useRef<HTMLInputElement>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Message list (chat) scroll area
  const messagesScrollAreaRef = useRef<HTMLDivElement>(null);
  const setMessagesScrollAreaNode = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    // Prefer the currently visible scroll area (mobile vs desktop)
    if (node.offsetParent === null && node.getClientRects().length === 0) return;
    messagesScrollAreaRef.current = node;
  }, []);

  // Conversation list scroll area (left sidebar)
  const conversationListScrollAreaRef = useRef<HTMLDivElement>(null);
  const setConversationListScrollAreaNode = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    conversationListScrollAreaRef.current = node;
  }, []);

  const isAtBottomRef = useRef(true);
  const lastTailMessageIdRef = useRef<string | null>(null);
  const pendingOutgoingRef = useRef<Array<{ tempId: string; content: string; sentAt: number }>>([]);
  
  // Monotonic counter for stable message ordering (prevents visual shuffle during reconciliation)
  const clientOrderRef = useRef(Date.now());

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

  const selectedConversation = useMemo(() => {
    const fromList = conversations.find((c) => c.id === selectedConversationId);
    if (fromList) return fromList;
    // Use newly created conversation as fallback while waiting for refetch
    if (newlyCreatedConversation && newlyCreatedConversation.id === selectedConversationId) {
      return newlyCreatedConversation;
    }
    return undefined;
  }, [conversations, selectedConversationId, newlyCreatedConversation]);

  // Check if audio mode is enabled for the SELECTED CONVERSATION (SINGLE SOURCE OF TRUTH)
  // This takes precedence over global voice config
  const conversationAudioEnabled = useMemo(() => {
    if (!selectedConversation) return false;
    return (selectedConversation as any).ai_audio_enabled === true;
  }, [selectedConversation]);

  // Show audio indicator if: voice is globally enabled AND conversation has audio mode active
  const showAudioIndicator = globalVoiceConfig?.enabled && conversationAudioEnabled;

  // Check if the WhatsApp instance is disconnected or deleted
  const instanceDisconnectedInfo = useMemo(() => {
    if (!selectedConversation) return null;
    
    const instanceId = selectedConversation.whatsapp_instance_id;
    
    // If no instance ID, the instance was deleted (conversation has NULL whatsapp_instance_id)
    if (!instanceId) {
      return { disconnected: true, deleted: true, instanceName: null };
    }
    
    // Find the instance and check its status
    const instance = whatsappInstances.find(inst => inst.id === instanceId);
    
    // Instance not found in the list (might have been deleted)
    if (!instance) {
      return { disconnected: true, deleted: true, instanceName: null };
    }
    
    // Instance exists but is not connected
    if (instance.status !== "connected") {
      return { 
        disconnected: true, 
        deleted: false, 
        instanceName: instance.display_name || instance.instance_name,
        instanceId: instance.id
      };
    }
    
    return null;
  }, [selectedConversation, whatsappInstances]);

  // Merge messages with inline activities, sorted by timestamp
  type TimelineItem = 
    | { type: 'message'; data: PaginatedMessage }
    | { type: 'activity'; data: (typeof inlineActivities)[0] };
  
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    
    // Add messages
    messages.forEach(msg => {
      items.push({ type: 'message', data: msg });
    });
    
    // Add activities
    inlineActivities.forEach(activity => {
      items.push({ type: 'activity', data: activity });
    });
    
    // Sort with stable ordering: use _clientOrder for optimistic messages to prevent shuffle
    return items.sort((a, b) => {
      // Get timestamps for primary sorting
      const aTime = a.type === 'message' 
        ? new Date(a.data.created_at).getTime() 
        : a.data.timestamp.getTime();
      const bTime = b.type === 'message' 
        ? new Date(b.data.created_at).getTime() 
        : b.data.timestamp.getTime();
      
      // If timestamps are within 1 second, use _clientOrder for tie-breaking
      // This maintains stability during optimistic update reconciliation
      if (Math.abs(aTime - bTime) < 1000) {
        const aClientOrder = a.type === 'message' ? (a.data as PaginatedMessage)._clientOrder : undefined;
        const bClientOrder = b.type === 'message' ? (b.data as PaginatedMessage)._clientOrder : undefined;
        
        if (aClientOrder !== undefined && bClientOrder !== undefined) {
          return aClientOrder - bClientOrder;
        }
      }
      
      // Primary sort by timestamp
      return aTime - bTime;
    });
  }, [messages, inlineActivities]);

  // Fetch user profile for signature
  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, job_title")
        .eq("id", user.id)
        .single();
      
      if (profile) {
        setUserProfile(profile);
      }
    };
    fetchProfile();
  }, []);

  // Calculate total unread from RPC data (already includes unread_count)
  // This eliminates N+1 queries - the RPC returns unread_count for each conversation
  const totalUnread = useMemo(() => 
    conversations.reduce((sum, conv) => sum + ((conv as any).unread_count || 0), 0),
    [conversations]
  );

  // Dynamic favicon based on unread count
  useDynamicFavicon(totalUnread);

  // Update browser tab title with unread count
  useEffect(() => {
    const baseTitle = "Conversas | MiauChat";
    
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }

    // Cleanup: reset title when leaving page
    return () => {
      document.title = "MiauChat | Multiplataforma de Inteligência Artificial Unificada";
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

    let skipFirst = true;

    const onScroll = () => {
      const atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 40;
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
      if (atBottom) setUnseenMessages(0);

      // Skip pagination on initial bind; only load more when user scrolls up
      if (skipFirst) {
        skipFirst = false;
        return;
      }

      // Pagination: load older messages when near the top
      handleMessagesScrollToTop(viewport);
    };

    viewport.addEventListener("scroll", onScroll, { passive: true } as any);
    onScroll();

    return () => viewport.removeEventListener("scroll", onScroll as any);
  }, [selectedConversationId, handleMessagesScrollToTop]);

  // Scroll to bottom when details panel is closed (layout reflow)
  // PROIBIDO auto-scroll a menos que o usuário esteja colado no fim
  useEffect(() => {
    if (!showDetailsPanel && selectedConversationId) {
      if (!isAtBottomRef.current) return;
      // Small delay to allow layout to settle before scrolling
      const timer = setTimeout(() => {
        scrollMessagesToBottom("auto");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showDetailsPanel, selectedConversationId, scrollMessagesToBottom]);

  // Handle deep-link via query params (?id=conversationId or ?phone=number&name=name)
  useEffect(() => {
    if (isLoading || !conversations.length) return;
    
    const idParam = searchParams.get("id");
    const phoneParam = searchParams.get("phone");
    const nameParam = searchParams.get("name");
    
    // Clear params after processing to avoid re-triggering
    const clearParams = () => {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("id");
      newParams.delete("phone");
      newParams.delete("name");
      setSearchParams(newParams, { replace: true });
    };
    
    // If ?id= is present, select that conversation directly
    if (idParam) {
      const conv = conversations.find(c => c.id === idParam);
      if (conv) {
        setSelectedConversationId(idParam);
        setShowMobileChat(true);
        setActiveTab("queue"); // Show all to ensure it's visible
      }
      clearParams();
      return;
    }
    
    // If ?phone= is present, find existing conversation or prepare to create new
    if (phoneParam) {
      let normalizedPhone = phoneParam.replace(/\D/g, "");
      
      // Ensure phone has country code (55 for Brazil) for proper WhatsApp matching
      // Brazilian phones without country code: starts with DDD (2 digits, 11-99)
      if (normalizedPhone.length >= 10 && normalizedPhone.length <= 11 && !normalizedPhone.startsWith("55")) {
        normalizedPhone = `55${normalizedPhone}`;
      }
      
      // Extract last 8-9 digits for flexible matching (handles 9th digit variations)
      const phoneEnding = normalizedPhone.slice(-9);
      
      // Try to find existing conversation by phone (flexible matching)
      const existingConv = conversations.find(c => {
        const convPhone = (c.contact_phone || "").replace(/\D/g, "");
        const convEnding = convPhone.slice(-9);
        return convPhone === normalizedPhone || 
               convEnding === phoneEnding ||
               convPhone.endsWith(normalizedPhone.slice(-8)) || 
               normalizedPhone.endsWith(convPhone.slice(-8));
      });
      
      if (existingConv) {
        setSelectedConversationId(existingConv.id);
        setShowMobileChat(true);
        setActiveTab("queue");
        clearParams();
      } else if (lawFirm?.id && connectedInstances.length > 0) {
        // No existing conversation - create one
        const createConversation = async () => {
          const instance = connectedInstances[0]; // Use first connected instance
          const remoteJid = normalizedPhone.includes("@") 
            ? normalizedPhone 
            : `${normalizedPhone}@s.whatsapp.net`;
          
          const { data: newConv, error } = await supabase
            .from("conversations")
            .insert({
              law_firm_id: lawFirm.id,
              remote_jid: remoteJid,
              contact_phone: normalizedPhone,
              contact_name: nameParam || normalizedPhone,
              current_handler: "human",
              status: "novo_contato",
              whatsapp_instance_id: instance.id,
              assigned_to: user?.id || null,
            })
            .select()
            .single();
          
          if (!error && newConv) {
            // Create a temporary conversation object for immediate use
            const tempConversation = {
              ...newConv,
              whatsapp_instance: instance,
              current_automation: null,
              client: null,
              department: null,
              assigned_profile: null,
              client_tags: [],
            };
            
            // Store temporarily so selectedConversation works before refetch
            setNewlyCreatedConversation(tempConversation);
            
            // Immediately set the conversation id so chat panel appears
            setSelectedConversationId(newConv.id);
            setShowMobileChat(true);
            setActiveTab("queue");
            
            // Also try to link to existing client by phone
            const { data: existingClient } = await supabase
              .from("clients")
              .select("id, name")
              .eq("law_firm_id", lawFirm.id)
              .or(`phone.eq.${normalizedPhone},phone.ilike.%${normalizedPhone.slice(-9)}%`)
              .limit(1)
              .single();
            
            if (existingClient) {
              await supabase
                .from("conversations")
                .update({ client_id: existingClient.id })
                .eq("id", newConv.id);
            }
            
            // Invalidate and refetch conversations
            await queryClient.invalidateQueries({ queryKey: ["conversations"] });
            
            // Clear temporary conversation after refetch
            setNewlyCreatedConversation(null);
            
            toast({
              title: "Conversa iniciada",
              description: `Nova conversa com ${nameParam || normalizedPhone}`,
            });
          } else if (error) {
            console.error("[Conversations] Error creating conversation:", error);
            toast({
              title: "Erro ao iniciar conversa",
              description: error.message,
              variant: "destructive",
            });
          }
        };
        
        createConversation();
        clearParams();
      } else {
        // No connected instances
        toast({
          title: "Nenhuma conexão ativa",
          description: "Conecte uma instância WhatsApp antes de iniciar conversas.",
          variant: "destructive",
        });
        clearParams();
      }
    }
  }, [isLoading, conversations, searchParams, setSearchParams, lawFirm?.id, connectedInstances, user?.id, queryClient, toast]);

  // Handle reply
  const handleReply = useCallback((messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      setReplyToMessage(message as any);
    }
  }, [messages]);

  // Clear state when no conversation selected
  useEffect(() => {
    if (!selectedConversationId) {
      setReplyToMessage(null);
      setShowMessageSearch(false);
      setMessageSearchQuery("");
    }
  }, [selectedConversationId]);

  // Handle new incoming messages - update unseen count if not at bottom
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last?.id) return;

    const prevLastId = lastTailMessageIdRef.current;

    // First render / initial load: just initialize the tail marker
    if (prevLastId === null) {
      lastTailMessageIdRef.current = last.id;
      return;
    }

    // Ignore pagination prepend (tail message didn't change)
    if (prevLastId === last.id) return;

    if (last.is_from_me) return;

    // Update tail marker for incoming messages
    lastTailMessageIdRef.current = last.id;

    // If user is reading older messages, show indicator
    if (!isAtBottomRef.current) {
      setUnseenMessages((c) => c + 1);
    } else {
      requestAnimationFrame(() => scrollMessagesToBottom("auto"));
    }
  }, [messages, scrollMessagesToBottom]);

  // Auto-scroll to bottom when opening a conversation (after messages load)
  useEffect(() => {
    if (!selectedConversationId) return;
    if (messagesLoading) return;

    requestAnimationFrame(() => {
      scrollMessagesToBottom("auto");
    });
  }, [selectedConversationId, messagesLoading, scrollMessagesToBottom]);

  // Auto-scroll when YOU send a new message (do not trigger on pagination prepend)
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last?.id) return;

    const prevLastId = lastTailMessageIdRef.current;

    // First render / initial load: just initialize the tail marker
    if (prevLastId === null) {
      lastTailMessageIdRef.current = last.id;
      return;
    }

    // If last message didn't change, we probably prepended older messages
    if (prevLastId === last.id) return;

    if (!last.is_from_me) return;

    // Update tail marker for outgoing messages
    lastTailMessageIdRef.current = last.id;

    requestAnimationFrame(() => {
      scrollMessagesToBottom("smooth");
    });
  }, [messages, scrollMessagesToBottom]);

  // Map conversations for display with tag colors
  const mappedConversations = useMemo(() => {
    const tagColorMap = tags.reduce((acc, tag) => {
      acc[tag.name] = tag.color;
      return acc;
    }, {} as Record<string, string>);

    // Helper to format last message preview - hide file names for audio/media
    // Check message_type FIRST before falling back to content (received media often has empty content)
    const getLastMessagePreview = (lastMessage: { content?: string | null; message_type?: string; is_from_me?: boolean } | null): string => {
      if (!lastMessage) return "Sem mensagens";
      const { content, message_type, is_from_me } = lastMessage;
      
      // Check message_type first - this handles received media with empty content
      switch (message_type) {
        case "audio":
          return is_from_me ? "🎤 Áudio enviado" : "🎤 Áudio";
        case "image":
          return is_from_me ? "📷 Imagem enviada" : "📷 Imagem";
        case "video":
          return is_from_me ? "🎬 Vídeo enviado" : "🎬 Vídeo";
        case "document":
          return is_from_me ? "📄 Documento enviado" : "📄 Documento";
        case "sticker":
          return "🎭 Figurinha";
        case "ptt": // Push-to-talk voice messages
          return is_from_me ? "🎤 Áudio enviado" : "🎤 Áudio";
      }
      
      // Fallback checks for content-based detection (older messages or edge cases)
      if (content?.toLowerCase().endsWith(".webm") || content?.toLowerCase().endsWith(".ogg")) {
        return is_from_me ? "🎤 Áudio enviado" : "🎤 Áudio";
      }
      
      // Check for media patterns [IMAGE], [VIDEO], [AUDIO], [DOCUMENT] in content
      // This handles template messages with embedded media URLs
      if (content) {
        const mediaPatternMatch = content.match(/\[(IMAGE|VIDEO|AUDIO|DOCUMENT)\](https?:\/\/[^\s\n]+)/i);
        if (mediaPatternMatch) {
          const mediaType = mediaPatternMatch[1].toUpperCase();
          // Extract text AFTER the media pattern (caption)
          const afterPattern = content.replace(/\[(IMAGE|VIDEO|AUDIO|DOCUMENT)\](https?:\/\/[^\s\n]+)/gi, "").trim();
          // Show caption if exists, otherwise show media type
          const caption = afterPattern ? afterPattern.slice(0, 40) : null;
          switch (mediaType) {
            case "IMAGE":
              return caption ? `📷 ${caption}` : (is_from_me ? "📷 Imagem enviada" : "📷 Imagem");
            case "VIDEO":
              return caption ? `🎬 ${caption}` : (is_from_me ? "🎬 Vídeo enviado" : "🎬 Vídeo");
            case "AUDIO":
              return caption ? `🎤 ${caption}` : (is_from_me ? "🎤 Áudio enviado" : "🎤 Áudio");
            case "DOCUMENT":
              return caption ? `📄 ${caption}` : (is_from_me ? "📄 Documento enviado" : "📄 Documento");
          }
        }
      }
      
      // Return content if available, otherwise show "Sem mensagens"
      return content?.trim() || "Sem mensagens";
    };

    const formatTimeAgoShort = (date: string | null) => {
      if (!date) return "---";
      try {
        const result = formatDistanceToNow(new Date(date), { addSuffix: false, locale: ptBR });
        return result
          .replace(" minutos", "m")
          .replace(" minuto", "m")
          .replace(" horas", "h")
          .replace(" hora", "h")
          .replace(" dias", "d")
          .replace(" dia", "d")
          .replace("menos de um minuto", "<1m");
      } catch {
        return "---";
      }
    };

    // Build a map of automation IDs to names for fast lookup
    const automationMap = automations.reduce((acc, a) => {
      acc[a.id] = a.name;
      return acc;
    }, {} as Record<string, string>);

    return conversations.map((conv) => {
      const hasActiveAutomation = !!conv.current_automation_id;
      const hasHumanAssigned = !!conv.assigned_to;

      // Determine effective handler type
      // "unassigned" = no active automation AND no human assigned
      // "ai" = has active automation
      // "human" = has human assigned (but no active automation)
      let effectiveHandler: "ai" | "human" | "unassigned";
      if (conv.current_handler === "ai" && hasActiveAutomation) {
        effectiveHandler = "ai";
      } else if (!hasActiveAutomation && !hasHumanAssigned) {
        effectiveHandler = "unassigned";
      } else {
        effectiveHandler = "human";
      }

      // Prefer the joined automation name from the conversation (backend source-of-truth)
      const joinedAutomationName = (conv as any).current_automation?.name as string | undefined;
      const aiAgentName = joinedAutomationName?.trim()
        ? joinedAutomationName
        : conv.current_automation_id
          ? automationMap[conv.current_automation_id] || "IA"
          : "IA";

      return {
        id: conv.id,
        name: conv.contact_name || conv.contact_phone || "Sem nome",
        phone: conv.contact_phone || "",
        lastMessage: getLastMessagePreview(conv.last_message),
        time: formatTimeAgoShort(conv.last_message_at),
        unread: (conv as any).unread_count || 0,
        handler: effectiveHandler,
        status: conv.status,
        archivedAt: (conv as any).archived_at || null,
        // Use client_tags from client_tags table instead of conversation.tags
        tags: (conv as any).client_tags || [],
        assignedTo: conv.assigned_profile?.full_name || null,
        assignedUserId: (conv as any).assigned_to || null,
        whatsappInstance: conv.whatsapp_instance?.display_name || conv.whatsapp_instance?.instance_name || null,
        whatsappPhone: conv.whatsapp_instance?.phone_number || null,
        avatarUrl: conv.client?.avatar_url || null,
        clientStatus: conv.client?.custom_status || null,
        department: conv.department || null,
        aiAgentName,
        scheduledFollowUps: followUpsByConversation[conv.id] || 0,
      };
    });
  }, [conversations, tags, automations, followUpsByConversation]);

  // Filter conversations by tab and filters
  const filteredConversations = useMemo(() => {
    return mappedConversations.filter((conv) => {
      // Search filter (name or phone)
      const matchesSearch = searchQuery === '' || 
        conv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.phone.includes(searchQuery);
      
      if (!matchesSearch) return false;

      // Handler filter (including unassigned)
      if (conversationFilters.handlers.length > 0) {
        const matchesHandler = conversationFilters.handlers.includes(conv.handler as any);
        if (!matchesHandler) return false;
      }

      // Status filter
      if (conversationFilters.statuses.length > 0) {
        if (!conv.clientStatus?.id || !conversationFilters.statuses.includes(conv.clientStatus.id)) {
          return false;
        }
      }

      // Tags filter
      if (conversationFilters.tags.length > 0) {
        const hasMatchingTag = conv.tags.some(t => conversationFilters.tags.includes(t.name));
        if (!hasMatchingTag) return false;
      }

      // Department filter
      if (conversationFilters.departments.length > 0) {
        if (!conv.department?.id || !conversationFilters.departments.includes(conv.department.id)) {
          return false;
        }
      }

      // Tab filter - use archivedAt to determine archived status
      const isArchived = !!conv.archivedAt;
      switch (activeTab) {
        case "chat":
          // "Chat": Only show conversations assigned to current user (as human handler), exclude archived
          return !isArchived && conv.handler === "human" && !!user?.id && conv.assignedUserId === user.id;
        case "ai":
          // Exclude archived from AI tab
          return !isArchived && conv.handler === "ai";
        case "queue":
          // "Fila": Only show unassigned conversations (pending - without responsible)
          // Include both "unassigned" handler AND "human" with no assigned user
          return !isArchived && (conv.handler === "unassigned" || (conv.handler === "human" && !conv.assignedUserId));
        case "all":
          // "Todos": Show all non-archived conversations
          return !isArchived;
        case "archived":
          // Only show archived conversations
          return isArchived;
        default:
          return true;
      }
    });
  }, [mappedConversations, conversationFilters, searchQuery, activeTab, user?.id]);

  // Infinite scroll for conversation list - frontend pagination over already-loaded data
  // Combined with backend pagination for loading more when needed
  const conversationScroll = useInfiniteScroll(filteredConversations, {
    initialBatchSize: 30,
    batchIncrement: 20,
    threshold: 150,
  });

  const {
    loadMore: loadMoreFrontend,
    hasMore: hasMoreFrontend,
    isLoadingMore: isLoadingMoreFrontend,
    displayedCount,
  } = conversationScroll;

  // Combined hasMore: frontend has more to show OR backend has more to load
  const hasMoreConversations = hasMoreFrontend || hasMoreFromBackend;
  const isLoadingMoreConversations = isLoadingMoreFrontend || isLoadingMoreFromBackend;

  // Load more function: first exhaust frontend, then load from backend
  const loadMoreConversations = useCallback(() => {
    if (hasMoreFrontend) {
      loadMoreFrontend();
    } else if (hasMoreFromBackend && !isLoadingMoreFromBackend) {
      loadMoreFromBackend();
    }
  }, [hasMoreFrontend, loadMoreFrontend, hasMoreFromBackend, isLoadingMoreFromBackend, loadMoreFromBackend]);

  // Radix ScrollArea: bind scroll listener to the internal viewport
  useEffect(() => {
    const root = conversationListScrollAreaRef.current;
    const viewport = root?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLDivElement | null;
    if (!viewport) return;

    const threshold = 150;

    const onScroll = () => {
      if (!hasMoreConversations || isLoadingMoreConversations) return;
      const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      if (remaining < threshold) {
        loadMoreConversations();
      }
    };

    viewport.addEventListener("scroll", onScroll, { passive: true } as any);
    onScroll();

    return () => viewport.removeEventListener("scroll", onScroll as any);
  }, [
    loadMoreConversations,
    hasMoreConversations,
    isLoadingMoreConversations,
    filteredConversations.length,
    displayedCount,
  ]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversationId || !selectedConversation) return;
    
    let messageToSend = messageInput.trim();
    const wasPontualMode = isPontualMode;
    const wasInternalMode = isInternalMode;
    const conversationId = selectedConversationId;
    const conversation = selectedConversation;
    
    // Add signature if enabled and not internal mode - name in bold+italic on top, message below
    if (signatureEnabled && userProfile?.full_name && !wasInternalMode) {
      const nameParts = userProfile.full_name.split(' ');
      const displayName = nameParts.length >= 2 
        ? `${nameParts[0]} ${nameParts[nameParts.length - 1]}`
        : nameParts[0];
      const signature = userProfile.job_title 
        ? `_*${displayName}*_ - ${userProfile.job_title}`
        : `_*${displayName}*_`;
      messageToSend = `${signature}\n${messageInput.trim()}`;
    }
    
    // Clear input IMMEDIATELY for instant UX - user can type next message right away
    setMessageInput("");
    setIsPontualMode(false);
    
    // Capture reply state before clearing
    const replyMessage = replyToMessage;
    setReplyToMessage(null);
    
    // Optimistically add message to local state with "sending" status
    // Use a temp whatsapp_message_id prefix to help with reconciliation
    const tempId = crypto.randomUUID();
    const tempWhatsAppId = `temp_${tempId}`;
    const messageTimestamp = new Date().toISOString();
    
    // Increment client order for stable sorting (prevents visual shuffle)
    const clientOrder = clientOrderRef.current++;
    
    const newMessage: Message = {
      id: tempId,
      content: messageToSend,
      created_at: messageTimestamp,
      is_from_me: true,
      sender_type: "human",
      ai_generated: false,
      status: wasInternalMode ? "sent" as MessageStatus : "sending" as MessageStatus,
      is_internal: wasInternalMode,
      is_pontual: wasPontualMode,
      whatsapp_message_id: wasInternalMode ? undefined : tempWhatsAppId,
      // Client-side ordering fields for stable visual order during reconciliation
      _clientOrder: clientOrder,
      _clientTempId: tempId,
    };
    
    // Add message - no sorting needed, _clientOrder ensures stable order
    // Messages with _clientOrder will always appear after messages without (older backend msgs)
    setMessages(prev => [...prev, newMessage]);

    if (!wasInternalMode) {
      pendingOutgoingRef.current.push({ tempId, content: messageToSend, sentAt: Date.now() });
      if (pendingOutgoingRef.current.length > 50) pendingOutgoingRef.current.shift();
    }
    
    // Enqueue message send to ensure strict ordering PER CONVERSATION
    // Messages within the same conversation are sent sequentially
    // Different conversations can send messages in parallel
    enqueueMessage(conversationId, async () => {
      if (wasInternalMode) {
        // Internal message - save directly to database, don't send to WhatsApp
        const { error } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
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
        // Normal message OR Pontual message - send to WhatsApp
        // If NOT in pontual mode: auto-assign to current user
        // If in pontual mode: send to WhatsApp but DON'T transfer from AI
        const shouldTransfer = !wasPontualMode && (
          conversation.current_handler === "ai" || 
          !conversation.assigned_to ||
          (conversation.assigned_to !== user?.id)
        );
        
        if (shouldTransfer) {
          await transferHandler.mutateAsync({
            conversationId: conversationId,
            handlerType: "human",
            assignedTo: user?.id,
          });
        }
        
        // Use async send for <1s response
        const replyWhatsAppId = replyMessage?.whatsapp_message_id || null;
        
        const response = await supabase.functions.invoke("evolution-api", {
          body: {
            action: "send_message_async",
            conversationId: conversationId,
            message: messageToSend,
            replyToWhatsAppMessageId: replyWhatsAppId,
            replyToMessageId: replyMessage?.id || null,
            isPontual: wasPontualMode, // Mark as pontual intervention
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
    }).catch((error) => {
      console.error("Erro ao enviar mensagem:", error);
      // Update message to show error status
      setMessages(prev => prev.map(m => 
        m.id === tempId 
          ? { ...m, status: "error" as MessageStatus }
          : m
      ));
      toast({
        title: "Erro ao enviar",
        description: error instanceof Error ? error.message : "Falha ao enviar mensagem",
        variant: "destructive",
      });
    });
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
      
      // Store the file path (not public URL since bucket is private)
      // The path will be used to generate signed URLs on download
      const filePath = fileName;
      
      // Save internal message with file - store path prefixed to identify internal files
      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversationId,
          content: `📎 ${file.name}`,
          message_type: "document",
          media_url: `internal-chat-files://${filePath}`,
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
        media_url: `internal-chat-files://${filePath}`,
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

  // Generate conversation summary using AI
  const handleGenerateSummary = async () => {
    if (!selectedConversationId || isGeneratingSummary) return;
    
    setIsGeneratingSummary(true);
    setGeneratedSummary("");
    setSummaryDialogOpen(true);
    
    try {
      const response = await supabase.functions.invoke("generate-summary", {
        body: { conversationId: selectedConversationId },
      });

      if (response.error) {
        throw new Error(response.error.message || "Erro ao gerar resumo");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      setGeneratedSummary(response.data?.summary || "Não foi possível gerar o resumo.");
      
      toast({
        title: "Resumo gerado",
        description: "O resumo da conversa foi gerado com sucesso.",
      });
    } catch (error) {
      console.error("Error generating summary:", error);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      setGeneratedSummary(`Erro: ${errorMessage}`);
      toast({
        title: "Erro ao gerar resumo",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSummary(false);
    }
  };
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

  // Toggle star/favorite on a message
  const handleToggleStar = useCallback(async (messageId: string, starred: boolean) => {
    try {
      const { error } = await supabase
        .from("messages")
        .update({ is_starred: starred })
        .eq("id", messageId);

      if (error) throw error;

      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, is_starred: starred } : m
      ));

      toast({
        title: starred ? "Mensagem favoritada" : "Favorito removido",
      });
    } catch (error) {
      console.error("Error toggling star:", error);
      toast({
        title: "Erro ao favoritar",
        description: error instanceof Error ? error.message : "Falha ao favoritar mensagem",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Delete message for everyone on WhatsApp
  const handleDeleteMessage = useCallback(async (messageId: string, whatsappMessageId: string, remoteJid: string) => {
    if (!selectedConversationId) return;

    try {
      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "delete_message",
          conversationId: selectedConversationId,
          whatsappMessageId,
          remoteJid,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Falha ao apagar mensagem");
      }

      // Update local state to show as revoked
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, is_revoked: true } : m
      ));

      toast({
        title: "Mensagem apagada",
        description: "A mensagem foi apagada para todos.",
      });
    } catch (error) {
      console.error("Error deleting message:", error);
      toast({
        title: "Erro ao apagar",
        description: error instanceof Error ? error.message : "Falha ao apagar mensagem",
        variant: "destructive",
      });
    }
  }, [selectedConversationId, toast]);

  // Download media from a message
  const handleDownloadMedia = useCallback(async (whatsappMessageId: string, conversationId: string, fileName?: string) => {
    try {
      toast({ title: "Baixando mídia..." });

      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "get_media",
          conversationId,
          whatsappMessageId,
        },
      });

      if (response.error || !response.data?.success || !response.data?.base64) {
        throw new Error(response.data?.error || "Falha ao baixar mídia");
      }

      const { base64, mimetype } = response.data;
      const dataUrl = `data:${mimetype || "application/octet-stream"};base64,${base64}`;

      // Create download link
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = fileName || `download_${whatsappMessageId.slice(0, 8)}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: "Download concluído" });
    } catch (error) {
      console.error("Error downloading media:", error);
      toast({
        title: "Erro ao baixar",
        description: error instanceof Error ? error.message : "Falha ao baixar mídia",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleSendMedia = async (file: File, mediaType: "image" | "audio" | "video" | "document") => {
    if (!selectedConversationId || !selectedConversation || isSending) return;
    
    setIsSending(true);
    
    try {
      // Auto-assign conversation to current user if handler is AI or no responsible assigned
      if (selectedConversation.current_handler === "ai" || !selectedConversation.assigned_to) {
        await transferHandler.mutateAsync({
          conversationId: selectedConversationId,
          handlerType: "human",
          assignedTo: user?.id,
        });
      }

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
          mimeType: file.type,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Falha ao enviar mídia");
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Falha ao enviar mídia");
      }

      // Do NOT add optimistic message here - backend already inserted via send_media
      // Realtime will bring the message with correct whatsapp_message_id
      
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
    // Support both file (local upload) and previewUrl (template media)
    if (!mediaPreview.file && !mediaPreview.previewUrl) return;
    
    setIsSending(true);
    
    try {
      // Auto-assign conversation to current user if handler is AI or no responsible assigned
      if (selectedConversation?.current_handler === "ai" || !selectedConversation?.assigned_to) {
        await transferHandler.mutateAsync({
          conversationId: selectedConversationId!,
          handlerType: "human",
          assignedTo: user?.id,
        });
      }

      let mediaBase64: string | undefined;
      let mediaUrl: string | undefined;
      let fileName: string;
      let mimeType: string;

      if (mediaPreview.file) {
        // Local file - convert to base64
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
        
        mediaBase64 = await base64Promise;
        fileName = mediaPreview.file.name;
        mimeType = mediaPreview.file.type;
      } else {
        // Template media - use URL directly
        mediaUrl = mediaPreview.previewUrl!;
        // Extract filename from URL
        const urlPath = new URL(mediaUrl).pathname;
        fileName = urlPath.split('/').pop() || 'media';
        // Infer mimeType from extension
        const ext = fileName.split('.').pop()?.toLowerCase();
        const mimeMap: Record<string, string> = {
          jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
          mp4: "video/mp4", mov: "video/quicktime", avi: "video/x-msvideo", webm: "video/webm",
          mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav",
          pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        };
        mimeType = mimeMap[ext || ''] || "application/octet-stream";
      }

      const response = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "send_media",
          conversationId: selectedConversationId,
          mediaType: mediaPreview.mediaType,
          ...(mediaBase64 ? { mediaBase64 } : { mediaUrl }),
          fileName,
          caption,
          mimeType,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Falha ao enviar mídia");
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Falha ao enviar mídia");
      }

      // Do NOT add optimistic message - backend already inserted via send_media
      // Realtime will bring the message with correct whatsapp_message_id
      handleMediaPreviewClose();
      
      toast({
        title: "Mídia enviada",
        description: `${fileName} enviado com sucesso!`,
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
      // Auto-assign to current user if:
      // 1. Handler is AI, or
      // 2. No responsible assigned, or
      // 3. Another attendant is assigned (transfer to current user)
      const shouldTransfer = !isPontualMode && selectedConversation && (
        selectedConversation.current_handler === "ai" || 
        !selectedConversation.assigned_to ||
        (selectedConversation.assigned_to !== user?.id)
      );
      
      if (shouldTransfer) {
        await transferHandler.mutateAsync({
          conversationId: selectedConversationId,
          handlerType: "human",
          assignedTo: user?.id,
        });
      }
      
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
          mimeType: audioBlob.type || "audio/webm",
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Falha ao enviar áudio");
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Falha ao enviar áudio");
      }

      // Do NOT add optimistic message here - let realtime handle it
      // The backend already inserted the message and realtime will bring it
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
      try {
        // Update conversation contact_name
        await updateConversation.mutateAsync({
          id: selectedConversation.id,
          contact_name: editingName.trim(),
        });
        
        // Also update linked client name if exists
        if (selectedConversation.client_id) {
          await updateClient.mutateAsync({
            id: selectedConversation.client_id,
            name: editingName.trim(),
          });
        }
        
        setEditNameDialogOpen(false);
      } catch (error) {
        console.error("Erro ao atualizar nome:", error);
      }
    }
  };

  const handleTransferHandler = (handler: "ai" | "human", assignedTo?: string | null, automationId?: string | null) => {
    if (selectedConversation) {
      transferHandler.mutate({
        conversationId: selectedConversation.id,
        handlerType: handler,
        assignedTo: assignedTo,
        automationId: automationId,
      });
    }
  };

  const handleChangeDepartment = (departmentId: string | null) => {
    if (selectedConversation) {
      updateConversationDepartment.mutate({
        conversationId: selectedConversation.id,
        departmentId,
        clientId: selectedConversation.client_id,
      });
    }
  };

  const handleChangeStatus = (statusId: string | null) => {
    if (selectedConversation?.client_id) {
      updateClientStatus.mutate({
        clientId: selectedConversation.client_id,
        statusId,
      });
    }
  };

  const handleChangeTags = (tagNames: string[]) => {
    if (selectedConversation) {
      updateConversationTags.mutate({
        conversationId: selectedConversation.id,
        tags: tagNames,
      });
    }
  };

  const openArchiveDialog = () => {
    if (!selectedConversation) return;
    setArchiveReason("resolved");
    setArchiveNextResponsible(null);
    setArchiveDialogOpen(true);
  };

  const handleArchiveConversation = async () => {
    if (!selectedConversation) return;

    try {
      // Determine the reason text
      const reasonText = archiveReason === "other" && archiveCustomReason.trim()
        ? archiveCustomReason.trim()
        : ARCHIVE_REASONS.find((r) => r.value === archiveReason)?.label || archiveReason;

      // Build the update payload - use archived_at column instead of status enum
      const updatePayload: any = {
        id: selectedConversation.id,
        archived_at: new Date().toISOString(),
        archived_reason: reasonText,
        internal_notes: selectedConversation.internal_notes
          ? `${selectedConversation.internal_notes}\n\n[Arquivado: ${reasonText}]`
          : `[Arquivado: ${reasonText}]`,
      };

      // If next responsible is an AI agent, update current_automation_id
      // If it's a human, update assigned_to
      if (archiveNextResponsible && archiveNextResponsible !== "none") {
        updatePayload.archived_next_responsible_id = archiveNextResponsible;
        updatePayload.archived_next_responsible_type = archiveNextResponsibleType;
        
        if (archiveNextResponsibleType === "ai") {
          updatePayload.current_automation_id = archiveNextResponsible;
          updatePayload.current_handler = "ai";
        } else {
          updatePayload.assigned_to = archiveNextResponsible;
          updatePayload.current_handler = "human";
        }
      }

      await updateConversation.mutateAsync(updatePayload);

      toast({ title: "Conversa arquivada" });
      setArchiveDialogOpen(false);
      setArchiveReason("resolved");
      setArchiveCustomReason("");
      setArchiveNextResponsible(null);
      setArchiveNextResponsibleType(null);
      setSelectedConversationId(null);
      setShowMobileChat(false);
    } catch (error) {
      console.error("Error archiving conversation:", error);
      toast({
        title: "Erro ao arquivar",
        description: "Não foi possível arquivar a conversa.",
        variant: "destructive",
      });
    }
  };

  // Get tab counts from dedicated backend query for consistency
  const getTabCount = (tab: ConversationTab) => {
    switch (tab) {
      case "chat":
        return tabCounts.chat;
      case "ai":
        return tabCounts.ai;
      case "queue":
        return tabCounts.queue;
      case "all":
        return tabCounts.all;
      case "archived":
        return tabCounts.archived;
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
    <div className="h-full w-full flex overflow-hidden min-h-0 min-w-0">
      {/* Mobile: show list or chat */}
      <div className={cn("md:hidden w-full", showMobileChat && "hidden")}>
        <div className="h-full flex flex-col bg-card">
          {/* Mobile Header */}
          <div className="p-3 border-b border-border space-y-3">
            <h1 className="text-lg font-bold text-foreground">Atendimentos</h1>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ConversationTab)}>
              <TabsList className="grid w-full grid-cols-4 h-8">
                <TabsTrigger value="chat" className="gap-1 text-xs h-7 px-1">
                  <Users className="h-3 w-3" />
                  Chat
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {getTabCount("chat")}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="ai" className="gap-1 text-xs h-7 px-1">
                  <Bot className="h-3 w-3" />
                  IA
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {getTabCount("ai")}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="queue" className="gap-1 text-xs h-7 px-1">
                  <Inbox className="h-3 w-3" />
                  Fila
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {getTabCount("queue")}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="all" className="gap-1 text-xs h-7 px-1">
                  <Users className="h-3 w-3" />
                  Todos
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {getTabCount("all")}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>

          {/* Archived button below tabs (mobile) */}
          <Button
            variant={activeTab === "archived" ? "secondary" : "ghost"}
            size="sm"
            className="w-full justify-start gap-1 h-6 text-[8px]"
            onClick={() => setActiveTab("archived")}
          >
            <Archive className="h-2 w-2" />
            Arquivados
            <Badge variant="secondary" className="h-3 px-1 text-[8px] ml-auto">
              {getTabCount("archived")}
            </Badge>
          </Button>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar conversa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              {/* Mais filtros button (mobile) */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <Filter className="h-4 w-4" />
                    {activeFiltersCount > 0 && (
                      <Badge 
                        variant="secondary" 
                        className="absolute -top-1 -right-1 h-4 px-1 text-[10px] min-w-4"
                      >
                        {activeFiltersCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <div className="p-3 border-b">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm">Filtros</h4>
                      {activeFiltersCount > 0 && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={clearAllFilters}
                        >
                          Limpar
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <ScrollArea className="max-h-[50vh]">
                    <div className="p-2 space-y-1">
                      {/* Status Filter (mobile) */}
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between h-9 px-2">
                            <div className="flex items-center gap-2">
                              <Tag className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">Status</span>
                              {conversationFilters.statuses.length > 0 && (
                                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                                  {conversationFilters.statuses.length}
                                </Badge>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                          {statuses.map(status => (
                            <label key={status.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                              <Checkbox 
                                checked={conversationFilters.statuses.includes(status.id)}
                                onCheckedChange={() => toggleStatusFilter(status.id)}
                              />
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />
                              <span className="text-sm">{status.name}</span>
                            </label>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                      
                      <Separator className="my-1" />
                      
                      {/* Handler Filter (mobile) */}
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between h-9 px-2">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">Atendente</span>
                              {conversationFilters.handlers.length > 0 && (
                                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                                  {conversationFilters.handlers.length}
                                </Badge>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                          <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                            <Checkbox checked={conversationFilters.handlers.includes('ai')} onCheckedChange={() => toggleHandlerFilter('ai')} />
                            <Bot className="h-4 w-4 text-purple-500" />
                            <span className="text-sm">IA</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                            <Checkbox checked={conversationFilters.handlers.includes('human')} onCheckedChange={() => toggleHandlerFilter('human')} />
                            <User className="h-4 w-4 text-green-500" />
                            <span className="text-sm">Humano</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                            <Checkbox checked={conversationFilters.handlers.includes('unassigned')} onCheckedChange={() => toggleHandlerFilter('unassigned')} />
                            <UserX className="h-4 w-4 text-amber-500" />
                            <span className="text-sm">Sem responsável</span>
                          </label>
                        </CollapsibleContent>
                      </Collapsible>
                      
                      <Separator className="my-1" />
                      
                      {/* Department Filter (mobile) */}
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between h-9 px-2">
                            <div className="flex items-center gap-2">
                              <Folder className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">Departamento</span>
                              {conversationFilters.departments.length > 0 && (
                                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                                  {conversationFilters.departments.length}
                                </Badge>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                          {departments.map(dept => (
                            <label key={dept.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                              <Checkbox 
                                checked={conversationFilters.departments.includes(dept.id)}
                                onCheckedChange={() => toggleDepartmentFilter(dept.id)}
                              />
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dept.color }} />
                              <span className="text-sm">{dept.name}</span>
                            </label>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>
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
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-sm font-medium truncate">{conv.name}</span>
                            {conv.whatsappPhone && (
                              <span className="text-[10px] text-yellow-500 font-medium flex items-center gap-0.5 flex-shrink-0">
                                <Phone className="h-2.5 w-2.5" />
                                {conv.whatsappPhone.slice(-4)}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">{conv.time}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          {/* Client Status Badge */}
                          {conv.clientStatus && (
                            <Badge 
                              variant="outline" 
                              className="text-[10px] h-5 px-1.5 font-medium"
                              style={{ 
                                borderColor: conv.clientStatus.color, 
                                backgroundColor: `${conv.clientStatus.color}15`,
                                color: conv.clientStatus.color 
                              }}
                            >
                              {conv.clientStatus.name}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1">
                          {(() => {
                            const isAI = conv.handler === "ai";
                            const isUnassigned = !isAI && !conv.assignedTo;

                            const label = isAI
                              ? `IA · ${conv.aiAgentName}`
                              : isUnassigned
                                ? "Sem responsável"
                                : (conv.assignedTo?.split(" ")[0] || "Atendente");

                            return (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] h-5 px-1.5 gap-0.5 max-w-[140px]",
                                  isAI
                                    ? "border-purple-500/50 text-purple-600 bg-purple-50 dark:bg-purple-900/20"
                                    : isUnassigned
                                      ? "border-amber-500/50 text-amber-600 bg-amber-50 dark:bg-amber-900/20"
                                      : "border-blue-500/50 text-blue-600 bg-blue-50 dark:bg-blue-900/20"
                                )}
                              >
                                {isAI ? (
                                  <Zap className="h-2.5 w-2.5 flex-shrink-0" />
                                ) : isUnassigned ? (
                                  <UserX className="h-2.5 w-2.5 flex-shrink-0" />
                                ) : (
                                  <User className="h-2.5 w-2.5 flex-shrink-0" />
                                )}
                                <span className="truncate">{label}</span>
                              </Badge>
                            );
                          })()}
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
                    <div className="flex-1">
                      <p className="font-medium">
                        {selectedConversation.contact_name || selectedConversation.contact_phone || "Sem nome"}
                      </p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {selectedConversation.contact_phone || "---"}
                      </p>
                    </div>
                    {/* Audio Mode Indicator Mobile */}
                    {showAudioIndicator && selectedConversation && (
                      <AudioModeIndicator
                        isAudioEnabled={true}
                        voiceId={globalVoiceConfig?.voiceId}
                        onDisable={() => {
                          // Disable audio mode for THIS CONVERSATION (SINGLE SOURCE OF TRUTH)
                          updateConversationAudioMode.mutate({
                            conversationId: selectedConversation.id,
                            enabled: false,
                            reason: 'manual_toggle',
                          });
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Mobile Messages */}
                <ScrollArea ref={setMessagesScrollAreaNode} className="flex-1 min-h-0">
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
                      <>
                        {/* Loading more indicator */}
                        {messagesLoadingMore && (
                          <div className="flex items-center justify-center py-2">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
                            <span className="text-xs text-muted-foreground">Carregando mais mensagens...</span>
                          </div>
                        )}
                        {hasMoreMessages && !messagesLoadingMore && (
                          <div className="text-center py-2">
                            <span className="text-xs text-muted-foreground">↑ Role para cima para carregar mais</span>
                          </div>
                        )}
                        {timelineItems.map((item, index) => {
                          const prevItem = index > 0 ? timelineItems[index - 1] : null;
                          // Get date from the correct field based on item type
                          const getItemDate = (timelineItem: { type: string; data: ActivityItem | PaginatedMessage } | null): string | Date | null => {
                            if (!timelineItem) return null;
                            if (timelineItem.type === 'activity') {
                              return (timelineItem.data as ActivityItem).timestamp;
                            }
                            return (timelineItem.data as PaginatedMessage).created_at;
                          };
                          const currentDate = getItemDate(item);
                          const prevDate = getItemDate(prevItem);
                          const showDateSep = shouldShowDateSeparator(currentDate!, prevDate);
                          
                          // Use _clientTempId for stable key during reconciliation (prevents remount/shuffle)
                          const stableKey = item.type === 'message' 
                            ? ((item.data as PaginatedMessage)._clientTempId || item.data.id)
                            : item.data.id;
                          
                          return (
                            <React.Fragment key={stableKey}>
                              {showDateSep && currentDate && (
                                <DateSeparator date={new Date(currentDate)} />
                              )}
                              {item.type === 'activity' ? (
                                <InlineActivityBadge activity={item.data} />
                              ) : (
                                <MessageBubble
                                  id={item.data.id}
                                  content={item.data.content}
                                  createdAt={item.data.created_at}
                                  isFromMe={item.data.is_from_me}
                                  senderType={item.data.sender_type || "user"}
                                  aiGenerated={item.data.ai_generated || false}
                                  mediaUrl={item.data.media_url}
                                  mediaMimeType={item.data.media_mime_type}
                                  messageType={item.data.message_type}
                                  status={(item.data.status || "sent") as MessageStatus}
                                  readAt={item.data.read_at}
                                  whatsappMessageId={item.data.whatsapp_message_id}
                                  conversationId={selectedConversationId || undefined}
                                  remoteJid={selectedConversation?.remote_jid}
                                  replyTo={item.data.reply_to}
                                  isInternal={item.data.is_internal}
                                  isPontual={item.data.is_pontual}
                                  aiAgentName={item.data.ai_agent_name}
                                  isRevoked={item.data.is_revoked}
                                  isStarred={item.data.is_starred}
                                  onReply={handleReply}
                                  onScrollToMessage={scrollToMessage}
                                  onRetry={handleRetryMessage}
                                  onToggleStar={handleToggleStar}
                                  onDelete={handleDeleteMessage}
                                  onDownloadMedia={handleDownloadMedia}
                                />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </>
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
                      disabled={!messageInput.trim()}
                    >
                      <Send className="h-5 w-5" />
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

      <div
        className="hidden md:grid h-full w-full min-h-0 grid-rows-1"
        style={{
          minWidth: 0,
          gridTemplateColumns:
            showDetailsPanel && selectedConversation
              ? "320px minmax(0, 1fr) 320px"
              : "320px minmax(0, 1fr)",
        }}
      >
        {/* Conversations List Panel - Fixed width */}
        <div className="bg-card flex flex-col min-h-0 min-w-0 border-r border-border overflow-hidden" style={{ width: '320px', minWidth: '320px' }}>
        {/* Header */}
        <div className="p-3 border-b border-border space-y-3">
          <h1 className="text-lg font-bold text-foreground">Atendimentos</h1>
          
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ConversationTab)}>
            <TabsList className="grid w-full grid-cols-4 h-8">
              <TabsTrigger value="chat" className="gap-1 text-xs h-7 px-1">
                <Users className="h-3 w-3" />
                Chat
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {getTabCount("chat")}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-1 text-xs h-7 px-1">
                <Bot className="h-3 w-3" />
                IA
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {getTabCount("ai")}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="queue" className="gap-1 text-xs h-7 px-1">
                <Inbox className="h-3 w-3" />
                Fila
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {getTabCount("queue")}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="all" className="gap-1 text-xs h-7 px-1">
                <Users className="h-3 w-3" />
                Todos
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {getTabCount("all")}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Archived button below tabs */}
          <Button
            variant={activeTab === "archived" ? "secondary" : "ghost"}
            size="sm"
            className="w-full justify-start gap-1 h-6 text-[8px]"
            onClick={() => setActiveTab("archived")}
          >
            <Archive className="h-2 w-2" />
            Arquivados
            <Badge variant="secondary" className="h-3 px-1 text-[8px] ml-auto">
              {getTabCount("archived")}
            </Badge>
          </Button>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            
            {/* Mais filtros popover - estilo Kanban */}
            <Popover open={filtersPopoverOpen} onOpenChange={setFiltersPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 px-2.5">
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs">Mais filtros</span>
                  {activeFiltersCount > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                      {activeFiltersCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="end">
                <div className="p-3 border-b">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">Filtros</h4>
                    {activeFiltersCount > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={clearAllFilters}
                      >
                        Limpar
                      </Button>
                    )}
                  </div>
                </div>
                
                <ScrollArea className="max-h-[60vh]">
                  <div className="p-2 space-y-1">
                    {/* Status Filter */}
                    <Collapsible open={statusFilterOpen} onOpenChange={setStatusFilterOpen}>
                      <CollapsibleTrigger asChild>
                        <Button 
                          variant="ghost" 
                          className="w-full justify-between h-9 px-2"
                        >
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Status</span>
                            {conversationFilters.statuses.length > 0 && (
                              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                                {conversationFilters.statuses.length}
                              </Badge>
                            )}
                          </div>
                          {statusFilterOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                        {statuses.map(status => (
                          <label 
                            key={status.id} 
                            className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded"
                          >
                            <Checkbox 
                              checked={conversationFilters.statuses.includes(status.id)}
                              onCheckedChange={() => toggleStatusFilter(status.id)}
                            />
                            <div 
                              className="w-2.5 h-2.5 rounded-full" 
                              style={{ backgroundColor: status.color }} 
                            />
                            <span className="text-sm">{status.name}</span>
                          </label>
                        ))}
                        {statuses.length === 0 && (
                          <p className="text-xs text-muted-foreground py-1">Nenhum status</p>
                        )}
                      </CollapsibleContent>
                    </Collapsible>

                    <Separator className="my-1" />

                    {/* Handler Filter */}
                    <Collapsible open={handlerFilterOpen} onOpenChange={setHandlerFilterOpen}>
                      <CollapsibleTrigger asChild>
                        <Button 
                          variant="ghost" 
                          className="w-full justify-between h-9 px-2"
                        >
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Atendente</span>
                            {conversationFilters.handlers.length > 0 && (
                              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                                {conversationFilters.handlers.length}
                              </Badge>
                            )}
                          </div>
                          {handlerFilterOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                          <Checkbox 
                            checked={conversationFilters.handlers.includes('ai')}
                            onCheckedChange={() => toggleHandlerFilter('ai')}
                          />
                          <Bot className="h-4 w-4 text-purple-500" />
                          <span className="text-sm">Inteligência Artificial</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                          <Checkbox 
                            checked={conversationFilters.handlers.includes('human')}
                            onCheckedChange={() => toggleHandlerFilter('human')}
                          />
                          <User className="h-4 w-4 text-green-500" />
                          <span className="text-sm">Humano</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                          <Checkbox 
                            checked={conversationFilters.handlers.includes('unassigned')}
                            onCheckedChange={() => toggleHandlerFilter('unassigned')}
                          />
                          <UserX className="h-4 w-4 text-amber-500" />
                          <span className="text-sm">Sem responsável</span>
                        </label>
                      </CollapsibleContent>
                    </Collapsible>

                    <Separator className="my-1" />

                    {/* Tags Filter */}
                    <Collapsible open={tagFilterOpen} onOpenChange={setTagFilterOpen}>
                      <CollapsibleTrigger asChild>
                        <Button 
                          variant="ghost" 
                          className="w-full justify-between h-9 px-2"
                        >
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Etiquetas</span>
                            {conversationFilters.tags.length > 0 && (
                              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                                {conversationFilters.tags.length}
                              </Badge>
                            )}
                          </div>
                          {tagFilterOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                        {tags.map(tag => (
                          <label 
                            key={tag.id} 
                            className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded"
                          >
                            <Checkbox 
                              checked={conversationFilters.tags.includes(tag.id)}
                              onCheckedChange={() => toggleTagFilter(tag.id)}
                            />
                            <div 
                              className="w-2.5 h-2.5 rounded-full" 
                              style={{ backgroundColor: tag.color }} 
                            />
                            <span className="text-sm">{tag.name}</span>
                          </label>
                        ))}
                        {tags.length === 0 && (
                          <p className="text-xs text-muted-foreground py-1">Nenhuma etiqueta</p>
                        )}
                      </CollapsibleContent>
                    </Collapsible>

                    {departments.length > 0 && (
                      <>
                        <Separator className="my-1" />

                        {/* Department Filter */}
                        <Collapsible open={departmentFilterOpen} onOpenChange={setDepartmentFilterOpen}>
                          <CollapsibleTrigger asChild>
                            <Button 
                              variant="ghost" 
                              className="w-full justify-between h-9 px-2"
                            >
                              <div className="flex items-center gap-2">
                                <Folder className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">Departamento</span>
                                {conversationFilters.departments.length > 0 && (
                                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                                    {conversationFilters.departments.length}
                                  </Badge>
                                )}
                              </div>
                              {departmentFilterOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-1">
                            {departments.map(dept => (
                              <label 
                                key={dept.id} 
                                className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded"
                              >
                                <Checkbox 
                                  checked={conversationFilters.departments.includes(dept.id)}
                                  onCheckedChange={() => toggleDepartmentFilter(dept.id)}
                                />
                                <div 
                                  className="w-2.5 h-2.5 rounded-full" 
                                  style={{ backgroundColor: dept.color }} 
                                />
                                <span className="text-sm">{dept.name}</span>
                              </label>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      </>
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Conversation List */}
        <ScrollArea 
          ref={setConversationListScrollAreaNode}
          className="flex-1 min-w-0" 
          viewportClassName="min-w-0"
        >
          <div className="p-2 space-y-1 min-w-0">
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
              <>
                {conversationScroll.visibleData.map((conv) => (
                  <ConversationSidebarCard
                    key={conv.id}
                    conversation={conv}
                    selected={selectedConversationId === conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                  />
                ))}
                {/* Load more indicator */}
                {conversationScroll.hasMore && (
                  <div className="py-2 text-center">
                    <p className="text-xs text-muted-foreground">
                      {conversationScroll.isLoadingMore ? "Carregando..." : `+${conversationScroll.totalCount - conversationScroll.displayedCount} conversas`}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
        </div>

        {/* Chat Area Panel - Flexible, shrinks to fit available space */}
        <div className="flex flex-col min-h-0 min-w-0 h-full w-full">
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
        <div className="flex-1 flex flex-col bg-background min-h-0 min-w-0 w-full h-full">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-border flex-shrink-0 min-w-0 overflow-x-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    onClick={() => setShowMobileChat(false)}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {(selectedConversation.contact_name || selectedConversation.contact_phone || "?")
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-medium truncate">
                        {selectedConversation.contact_name || selectedConversation.contact_phone || "Sem nome"}
                      </p>
                      <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={openEditName}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 min-w-0">
                      <Phone className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{selectedConversation.contact_phone || "---"}</span>
                    </p>
                    <div className="flex items-center gap-1 mt-1 min-w-0">
                      <Inbox className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      {/* Show dropdown if: multiple instances exist OR current instance is disconnected/missing */}
                      {(whatsappInstances.length > 1 || instanceDisconnectedInfo) ? (
                        <Select
                          value={selectedConversation.whatsapp_instance_id || ""}
                          onValueChange={async (value) => {
                            if (value && selectedConversation?.id && value !== selectedConversation.whatsapp_instance_id) {
                              // Buscar dados das instâncias antiga e nova
                              const oldInstance = whatsappInstances.find(
                                (inst) => inst.id === selectedConversation.whatsapp_instance_id
                              );
                              const newInstance = whatsappInstances.find(
                                (inst) => inst.id === value
                              );
                              
                              const changeData = {
                                conversationId: selectedConversation.id,
                                newInstanceId: value,
                                oldInstanceName: oldInstance?.display_name || oldInstance?.instance_name || "Desconhecido",
                                newInstanceName: newInstance?.display_name || newInstance?.instance_name || "Desconhecido",
                                oldPhoneDigits: oldInstance?.phone_number?.slice(-4),
                                newPhoneDigits: newInstance?.phone_number?.slice(-4),
                              };

                              // Check if there's a conflict before proceeding
                              try {
                                const result = await checkExistingConversationInDestination(
                                  selectedConversation.id,
                                  value,
                                  selectedConversation.law_firm_id
                                );
                                
                                if (result.exists) {
                                  // Show confirmation dialog
                                  setPendingInstanceChange({
                                    ...changeData,
                                    existingConvName: result.existingConvName,
                                  });
                                  setInstanceChangeDialogOpen(true);
                                } else {
                                  // No conflict, proceed directly
                                  changeWhatsAppInstance.mutate(changeData);
                                }
                              } catch (error) {
                                // If check fails, try direct mutation (will handle errors there)
                                changeWhatsAppInstance.mutate(changeData);
                              }
                            }
                          }}
                        >
                          <SelectTrigger className={`h-6 text-xs border-none p-0 pl-1 bg-transparent w-auto min-w-0 max-w-[220px] ${instanceDisconnectedInfo ? 'text-destructive' : ''}`}>
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
                                    {inst.display_name || inst.instance_name}
                                    {lastDigits && <span className="text-muted-foreground">(...{lastDigits})</span>}
                                    {isConnected && <span className="text-green-500 text-[10px]">✓</span>}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground truncate">
                          Canal: {selectedConversation.whatsapp_instance?.display_name || selectedConversation.whatsapp_instance?.instance_name || connectedInstances[0]?.display_name || connectedInstances[0]?.instance_name || "Não vinculado"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
                  {/* Audio Mode Indicator */}
                  {showAudioIndicator && selectedConversation && (
                    <AudioModeIndicator
                      isAudioEnabled={true}
                      voiceId={globalVoiceConfig?.voiceId}
                      className="min-w-0 max-w-[260px]"
                      onDisable={() => {
                        // Disable audio mode for THIS CONVERSATION (SINGLE SOURCE OF TRUTH)
                        updateConversationAudioMode.mutate({
                          conversationId: selectedConversation.id,
                          enabled: false,
                          reason: 'manual_toggle',
                        });
                      }}
                    />
                  )}

                  {/* AI Provider Indicator */}
                  <AIProviderBadge size="sm" className="min-w-0 max-w-[200px]" />
                  {/* Transfer Handler - Categorized */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="shrink-0">
                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                        Transferir
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                      <div className="p-3 border-b">
                        <h4 className="font-medium text-sm">Transferir para</h4>
                      </div>
                    <ScrollArea className="max-h-[60vh]">
                      <div className="p-2 space-y-1">
                        {/* IA Section */}
                        {automations.filter(a => a.is_active).length > 0 && (
                          <div className="pb-2">
                            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                              <Bot className="h-3 w-3" />
                              IA
                            </div>
                            {automations.filter(a => a.is_active).map(automation => (
                              <Button
                                key={automation.id}
                                variant={selectedConversation.current_handler === "ai" ? "secondary" : "ghost"}
                                size="sm"
                                className="w-full justify-start h-9"
                                onClick={() => handleTransferHandler("ai", null, automation.id)}
                              >
                                <div className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mr-2">
                                  <Zap className="h-3.5 w-3.5 text-purple-600" />
                                </div>
                                <span className="truncate">{automation.name}</span>
                              </Button>
                            ))}
                          </div>
                        )}

                        {/* Humano Section */}
                        {teamMembers.length > 0 && (
                          <div className="pb-2 border-t pt-2">
                            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                              <User className="h-3 w-3" />
                              Humano
                            </div>
                            {teamMembers.map(member => (
                              <Button
                                key={member.id}
                                variant={selectedConversation.current_handler === "human" && selectedConversation.assigned_to === member.id ? "secondary" : "ghost"}
                                size="sm"
                                className="w-full justify-start h-9"
                                onClick={() => handleTransferHandler("human", member.id)}
                              >
                                <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-2">
                                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                                    {member.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                                  </span>
                                </div>
                                <span className="truncate">{member.full_name}</span>
                              </Button>
                            ))}
                          </div>
                        )}

                        {/* Departamento Section */}
                        {departments.length > 0 && (
                          <div className="border-t pt-2">
                            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                              <Folder className="h-3 w-3" />
                              Departamento
                            </div>
                            {departments.map(dept => (
                              <Button
                                key={dept.id}
                                variant={selectedConversation.department_id === dept.id ? "secondary" : "ghost"}
                                size="sm"
                                className="w-full justify-start h-9"
                                onClick={() => handleChangeDepartment(dept.id)}
                              >
                                <div 
                                  className="w-7 h-7 rounded-full flex items-center justify-center mr-2"
                                  style={{ backgroundColor: `${dept.color}20` }}
                                >
                                  <Folder className="h-3.5 w-3.5" style={{ color: dept.color }} />
                                </div>
                                <span className="truncate">{dept.name}</span>
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
                {/* Search Messages Button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground/60 hover:text-muted-foreground"
                      onClick={() => setShowMessageSearch(true)}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Buscar mensagens</TooltipContent>
                </Tooltip>

                {/* Archive button - opens dialog with reason selection */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground/60 hover:text-muted-foreground"
                      onClick={openArchiveDialog}
                      title="Arquivar"
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Arquivar</TooltipContent>
                </Tooltip>

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

                {/* Toggle Details Panel */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => setShowDetailsPanel(!showDetailsPanel)}
                    >
                      {showDetailsPanel ? (
                        <PanelRightClose className="h-5 w-5" />
                      ) : (
                        <PanelRightOpen className="h-5 w-5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {showDetailsPanel ? "Fechar painel" : "Abrir detalhes"}
                  </TooltipContent>
                </Tooltip>
              </div>
              </div>
              {/* Scheduled Follow-up Indicator */}
              <ScheduledFollowUpIndicator 
                conversationId={selectedConversation.id} 
                variant="full"
                className="mx-4 mb-2"
              />
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


            {/* Messages */}
            <div className="relative flex-1 min-h-0 min-w-0 overflow-x-hidden">
              <ScrollArea 
                ref={setMessagesScrollAreaNode} 
                className="h-full w-full min-w-0" 
                viewportClassName="min-w-0 overflow-x-hidden"
              >
                <div className="py-4 space-y-4 w-full min-w-0 px-3 lg:px-4">
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
                    <>
                      {/* Loading more indicator */}
                      {messagesLoadingMore && (
                        <div className="flex items-center justify-center py-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
                          <span className="text-xs text-muted-foreground">Carregando mais mensagens...</span>
                        </div>
                      )}
                      {hasMoreMessages && !messagesLoadingMore && (
                        <div className="text-center py-2">
                          <span className="text-xs text-muted-foreground">↑ Role para cima para carregar mais</span>
                        </div>
                      )}
                      {timelineItems.map((item, index) => {
                        const prevItem = index > 0 ? timelineItems[index - 1] : null;
                        // Get date from the correct field based on item type
                        const getItemDate = (timelineItem: { type: string; data: ActivityItem | PaginatedMessage } | null): string | Date | null => {
                          if (!timelineItem) return null;
                          if (timelineItem.type === 'activity') {
                            return (timelineItem.data as ActivityItem).timestamp;
                          }
                          return (timelineItem.data as PaginatedMessage).created_at;
                        };
                        const currentDate = getItemDate(item);
                        const prevDate = getItemDate(prevItem);
                        const showDateSep = shouldShowDateSeparator(currentDate!, prevDate);
                        
                        // Use _clientTempId for stable key during reconciliation (prevents remount/shuffle)
                        const stableKey = item.type === 'message' 
                          ? ((item.data as PaginatedMessage)._clientTempId || item.data.id)
                          : item.data.id;
                        
                        return (
                          <React.Fragment key={stableKey}>
                            {showDateSep && currentDate && (
                              <DateSeparator date={new Date(currentDate)} />
                            )}
                            {item.type === 'activity' ? (
                              <InlineActivityBadge activity={item.data} />
                            ) : (
                              <div data-message-id={item.data.id} ref={(el) => { if (el) messageRefs.current.set(item.data.id, el); }}>
                                <MessageBubble
                                  id={item.data.id}
                                  content={item.data.content}
                                  createdAt={item.data.created_at}
                                  isFromMe={item.data.is_from_me}
                                  senderType={item.data.sender_type || "user"}
                                  aiGenerated={item.data.ai_generated || false}
                                  mediaUrl={item.data.media_url}
                                  mediaMimeType={item.data.media_mime_type}
                                  messageType={item.data.message_type}
                                  status={(item.data.status || "sent") as MessageStatus}
                                  readAt={item.data.read_at}
                                  whatsappMessageId={item.data.whatsapp_message_id}
                                  conversationId={selectedConversationId || undefined}
                                  remoteJid={selectedConversation?.remote_jid}
                                  replyTo={item.data.reply_to}
                                  isInternal={item.data.is_internal}
                                  isPontual={item.data.is_pontual}
                                  aiAgentName={item.data.ai_agent_name}
                                  isRevoked={item.data.is_revoked}
                                  isStarred={item.data.is_starred}
                                  onReply={handleReply}
                                  onScrollToMessage={scrollToMessage}
                                  onRetry={handleRetryMessage}
                                  onToggleStar={handleToggleStar}
                                  onDelete={handleDeleteMessage}
                                  onDownloadMedia={handleDownloadMedia}
                                  highlightText={messageSearchQuery ? (text) => highlightText(text, messageSearchQuery) : undefined}
                                  isHighlighted={highlightedMessageId === item.data.id}
                                />
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </>
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
              isInternalMode && "border-t-2 border-t-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10",
              instanceDisconnectedInfo && "border-t-2 border-t-red-500"
            )}>
              {/* WhatsApp Disconnected Banner */}
              {instanceDisconnectedInfo && (
                <div className="w-full mb-2 flex items-center justify-between bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2 rounded-md text-sm">
                  <span className="flex items-center gap-2">
                    <WifiOff className="h-4 w-4" />
                    {instanceDisconnectedInfo.deleted 
                      ? "WhatsApp sem conexão. A conexão foi excluída ou desvinculada."
                      : `WhatsApp desconectado. Clique no botão para reconectar.`
                    }
                  </span>
                  {!instanceDisconnectedInfo.deleted && (
                    <Button 
                      variant="default"
                      size="sm" 
                      className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => window.open("/connections", "_blank")}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Reconectar
                    </Button>
                  )}
                </div>
              )}

              {/* Pontual Mode Indicator */}
              {isPontualMode && (
                <div className="w-full mb-2 flex items-center justify-between bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-md text-sm">
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
                <div className="w-full mb-2 flex items-center justify-between bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 px-3 py-1.5 rounded-md text-sm">
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
                <div className="w-full px-3 lg:px-4">
                  <AudioRecorder
                    onSend={handleSendAudioRecording}
                    onCancel={() => setShowAudioRecorder(false)}
                    disabled={isSending}
                  />
                </div>
              ) : (
                <div className="w-full px-3 lg:px-4 flex items-end gap-2 relative">
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
                  
                  {/* Plus Menu - Only show when NOT in internal mode */}
                  {!isInternalMode && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-muted-foreground"
                        >
                          <Plus className="h-5 w-5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="start" side="top">
                        <div className="space-y-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => {
                              // Insert emoji picker placeholder - for now just add a smile
                              setMessageInput(prev => prev + "😊");
                              textareaRef.current?.focus();
                            }}
                          >
                            <Smile className="h-4 w-4 mr-2" />
                            Emoji
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => {
                              documentInputRef.current?.click();
                            }}
                          >
                            <Paperclip className="h-4 w-4 mr-2" />
                            Selecionar arquivo
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => {
                              imageInputRef.current?.click();
                            }}
                          >
                            <Image className="h-4 w-4 mr-2" />
                            Enviar imagem
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            onClick={handleGenerateSummary}
                            disabled={isGeneratingSummary}
                          >
                            {isGeneratingSummary ? (
                              <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            ) : (
                              <Sparkles className="h-4 w-4 mr-2" />
                            )}
                            {isGeneratingSummary ? "Gerando..." : "Gerar resumo"}
                          </Button>
                          <div className="border-t my-1" />
                          <div className="flex items-center justify-between px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              <FileSignature className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">Assinatura</span>
                            </div>
                            <Switch
                              checked={signatureEnabled}
                              onCheckedChange={setSignatureEnabled}
                            />
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                  <div className="flex-1 relative">
                    <TemplatePopup
                      isOpen={showTemplatePopup}
                      templates={templates.filter(t => t.is_active)}
                      searchTerm={templateSearchTerm}
                      onSelect={async (template: Template) => {
                        // Check if template contains media pattern
                        const mediaMatch = template.content.match(/\[(IMAGE|VIDEO|AUDIO|DOCUMENT)\](https?:\/\/[^\s\n]+)/i);
                        
                        if (mediaMatch && !isInternalMode) {
                          const mediaType = mediaMatch[1].toUpperCase();
                          const mediaUrl = mediaMatch[2];
                          // Extract caption (text after the media pattern)
                          const caption = template.content.replace(/\[(IMAGE|VIDEO|AUDIO|DOCUMENT)\](https?:\/\/[^\s\n]+)/gi, "").trim();
                          
                          // Set caption in input
                          setMessageInput(caption);
                          
                          // Determine media type for preview
                          let previewMediaType: "image" | "video" | "audio" | "document" = "image";
                          if (mediaType === "VIDEO") previewMediaType = "video";
                          else if (mediaType === "AUDIO") previewMediaType = "audio";
                          else if (mediaType === "DOCUMENT") previewMediaType = "document";
                          
                          // Open media preview with URL (create a fake file for the dialog)
                          setMediaPreview({
                            open: true,
                            file: null,
                            mediaType: previewMediaType,
                            previewUrl: mediaUrl,
                          });
                        } else {
                          // Regular text template
                          setMessageInput(template.content);
                        }
                        
                        setShowTemplatePopup(false);
                        setTemplateSearchTerm("");
                        textareaRef.current?.focus();
                      }}
                      onClose={() => {
                        setShowTemplatePopup(false);
                        setTemplateSearchTerm("");
                      }}
                    />
                    <AutoResizeTextarea
                      ref={textareaRef}
                      placeholder="Digite / para templates..."
                      minRows={1}
                      maxRows={5}
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
                      onPaste={async (e) => {
                        const items = e.clipboardData?.items;
                        if (!items) return;

                        for (let i = 0; i < items.length; i++) {
                          const item = items[i];
                          
                          // Handle image paste
                          if (item.type.startsWith("image/")) {
                            e.preventDefault();
                            const file = item.getAsFile();
                            if (file && !isInternalMode) {
                              // Open media preview dialog with the pasted image
                              const previewUrl = URL.createObjectURL(file);
                              setMediaPreview({
                                open: true,
                                file,
                                mediaType: "image",
                                previewUrl,
                              });
                            }
                            return;
                          }
                          
                          // Handle file paste (some browsers support this)
                          if (item.kind === "file" && !item.type.startsWith("image/")) {
                            e.preventDefault();
                            const file = item.getAsFile();
                            if (file && !isInternalMode) {
                              const fileType = file.type;
                              if (fileType.startsWith("video/")) {
                                const previewUrl = URL.createObjectURL(file);
                                setMediaPreview({
                                  open: true,
                                  file,
                                  mediaType: "video",
                                  previewUrl,
                                });
                              } else if (fileType.startsWith("audio/")) {
                                handleSendMedia(file, "audio");
                              } else {
                                handleSendMedia(file, "document");
                              }
                            }
                            return;
                          }
                        }
                        // Text paste is handled by default browser behavior
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
                      disabled={!messageInput.trim()}
                    >
                      <Send className="h-5 w-5" />
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
        </div>

        {/* Contact Details Panel - Fixed width with explicit flex-basis */}
        {showDetailsPanel && selectedConversation && (
          <div className="h-full min-h-0 bg-card border-l border-border overflow-y-auto overflow-x-hidden" style={{ width: '320px', minWidth: '320px' }}>
              <ContactDetailsPanel
                conversation={{
                  ...selectedConversation,
                  assigned_to: selectedConversation.assigned_to,
                  ai_summary: selectedConversation.ai_summary,
                  // Pass current_automation from join for real-time name display
                  current_automation: (selectedConversation as any).current_automation || null,
                  client: selectedConversation.client_id ? {
                    id: selectedConversation.client_id,
                    custom_status_id: (selectedConversation as any).client?.custom_status_id,
                  } : null,
                }}
                departments={departments.map(d => ({ id: d.id, name: d.name, color: d.color }))}
                tags={tags.map(t => ({ id: t.id, name: t.name, color: t.color }))}
                statuses={statuses.map(s => ({ id: s.id, name: s.name, color: s.color }))}
                members={teamMembers.map(m => ({ id: m.id, full_name: m.full_name }))}
                automations={automations.map(a => ({ id: a.id, name: a.name, is_active: a.is_active }))}
                onClose={() => setShowDetailsPanel(false)}
                onEditName={openEditName}
                onTransferHandler={handleTransferHandler}
                onChangeDepartment={handleChangeDepartment}
                onChangeStatus={handleChangeStatus}
                onChangeTags={handleChangeTags}
              />
          </div>
        )}
      </div>

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

      {/* Summary Dialog */}
      <Dialog open={summaryDialogOpen} onOpenChange={setSummaryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Resumo da Conversa
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {isGeneratingSummary ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Gerando resumo com IA...</p>
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/50 p-4 rounded-lg max-h-80 overflow-y-auto">
                  {generatedSummary}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setSummaryDialogOpen(false)}
            >
              Fechar
            </Button>
            {!isGeneratingSummary && generatedSummary && !generatedSummary.startsWith("Erro:") && (
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(generatedSummary);
                  toast({
                    title: "Copiado",
                    description: "Resumo copiado para a área de transferência",
                  });
                }}
              >
                Copiar resumo
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Media Preview Dialog */}
      <MediaPreviewDialog
        open={mediaPreview.open}
        onClose={handleMediaPreviewClose}
        onSend={(caption) => {
          handleMediaPreviewSend(caption);
          setMessageInput(""); // Clear input after sending
        }}
        file={mediaPreview.file}
        mediaType={mediaPreview.mediaType}
        previewUrl={mediaPreview.previewUrl}
        isSending={isSending}
        initialCaption={messageInput}
      />

      {/* Archive Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Arquivamento do chat</DialogTitle>
            <p className="text-sm text-muted-foreground text-center mt-1">
              Selecione o motivo do arquivamento e o próximo responsável.
              <br />
              Pressione Enter para confirmar.
            </p>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            {/* Archive Reason */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Motivo do arquivamento</Label>
              <div className="space-y-2">
                {ARCHIVE_REASONS.map((reason) => (
                  <div
                    key={reason.value}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                      archiveReason === reason.value
                        ? "bg-muted"
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => setArchiveReason(reason.value)}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                        archiveReason === reason.value
                          ? "border-primary bg-primary"
                          : "border-muted-foreground"
                      )}
                    >
                      {archiveReason === reason.value && (
                        <div className="w-2 h-2 bg-primary-foreground rounded-full" />
                      )}
                    </div>
                    <span className="text-sm">{reason.label}</span>
                  </div>
                ))}
              </div>
              {/* Custom reason text field when "Outros" is selected */}
              {archiveReason === "other" && (
                <Input
                  placeholder="Digite o motivo..."
                  value={archiveCustomReason}
                  onChange={(e) => setArchiveCustomReason(e.target.value)}
                  className="mt-2"
                  autoFocus
                />
              )}
            </div>

            {/* Next Responsible */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Próximo responsável</Label>
              <Select
                value={archiveNextResponsible ? `${archiveNextResponsibleType}:${archiveNextResponsible}` : "none"}
                onValueChange={(v) => {
                  if (v === "none") {
                    setArchiveNextResponsible(null);
                    setArchiveNextResponsibleType(null);
                  } else {
                    const [type, id] = v.split(":");
                    setArchiveNextResponsibleType(type as "human" | "ai");
                    setArchiveNextResponsible(id);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Selecionar responsável" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Nenhum responsável</span>
                  </SelectItem>
                  {/* AI Agents */}
                  {automations.filter(a => a.is_active).length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Agentes IA
                      </div>
                      {automations.filter(a => a.is_active).map((agent) => (
                        <SelectItem key={`ai:${agent.id}`} value={`ai:${agent.id}`}>
                          <div className="flex items-center gap-2">
                            <Bot className="h-3 w-3 text-purple-500" />
                            {agent.name}
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {/* Human Team Members */}
                  {teamMembers.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Atendentes
                      </div>
                      {teamMembers.map((member) => (
                        <SelectItem key={`human:${member.id}`} value={`human:${member.id}`}>
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3 text-green-500" />
                            {member.full_name}
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Este será o responsável quando o lead retornar. (Opcional)
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setArchiveDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={handleArchiveConversation}
            >
              Arquivar chat
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Instance Change Confirmation Dialog */}
      <AlertDialog open={instanceChangeDialogOpen} onOpenChange={setInstanceChangeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Atenção: Conversa será excluída</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Já existe uma conversa com este contato na instância <strong>{pendingInstanceChange?.newInstanceName}</strong>.
              </p>
              <p className="font-medium text-destructive">
                ⚠️ Ao continuar:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                <li>A conversa atual ({pendingInstanceChange?.oldInstanceName}) será <strong>movida</strong> para a nova instância</li>
                <li>A conversa existente em "{pendingInstanceChange?.newInstanceName}" será <strong className="text-destructive">EXCLUÍDA PERMANENTEMENTE</strong></li>
                <li>Todo o histórico de mensagens da conversa atual será preservado</li>
                <li className="text-muted-foreground">O histórico de mensagens da conversa de destino será perdido</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setInstanceChangeDialogOpen(false);
              setPendingInstanceChange(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (pendingInstanceChange) {
                  changeWhatsAppInstance.mutate({
                    ...pendingInstanceChange,
                    forceUnify: true,
                  });
                }
                setInstanceChangeDialogOpen(false);
                setPendingInstanceChange(null);
              }}
            >
              Excluir e mover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
    </TooltipProvider>
  );
}
