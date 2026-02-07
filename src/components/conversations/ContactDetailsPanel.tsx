import { useState, useMemo, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useDepartments } from "@/hooks/useDepartments";
import { useTags } from "@/hooks/useTags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Phone,
  Mail,
  MapPin,
  Tag,
  Folder,
  User,
  Bot,
  Clock,
  MessageSquare,
  FileText,
  ChevronDown,
  ChevronRight,
  Pencil,
  X,
  Check,
  Users,
  CircleDot,
  Image as ImageIcon,
  File,
  Cloud,
  Zap,
  Music,
  Sparkles,
  Star,
  CheckSquare,
  Copy,
  Heart,
  Video,
  StickyNote,
  RefreshCw,
  Loader2,
  Megaphone,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { MediaGalleryItem } from "./MediaGalleryItem";
import { DecryptedMediaListItem } from "./DecryptedMediaListItem";
import { toast } from "@/hooks/use-toast";
import { useClientActions } from "@/hooks/useClientActions";

interface Automation {
  id: string;
  name: string;
  is_active: boolean;
}

interface MediaItem {
  id: string;
  media_url: string | null;
  media_mime_type: string | null;
  message_type: string;
  created_at: string;
  whatsapp_message_id: string | null;
  content: string | null;
  conversation_id: string;
}

interface StarredMessage {
  id: string;
  content: string | null;
  created_at: string;
  is_from_me: boolean;
  sender_name: string | null;
}

interface InternalNote {
  id: string;
  content: string;
  created_at: string;
  sender_name: string | null;
}

interface ContactDetailsPanelProps {
  conversation: {
    id: string;
    contact_name: string | null;
    contact_phone: string | null;
    current_handler: 'ai' | 'human';
    current_automation_id?: string | null;
    current_automation?: { id: string; name: string } | null;
    department_id: string | null;
    tags: string[] | null;
    created_at: string;
    last_message_at: string | null;
    assigned_to?: string | null;
    ai_summary?: string | null;
    origin?: string | null;
    origin_metadata?: {
      ad_title?: string | null;
      ad_body?: string | null;
      ad_thumbnail?: string | null;
      ad_media_url?: string | null;
      ad_source_id?: string | null;
      ad_source_url?: string | null;
      ad_source_type?: string | null;
      detected_at?: string | null;
    } | null;
    client?: {
      id?: string;
      email?: string | null;
      address?: string | null;
      document?: string | null;
      notes?: string | null;
      custom_status_id?: string | null;
      avatar_url?: string | null;
    } | null;
    assigned_profile?: { full_name: string } | null;
    whatsapp_instance?: { id?: string; instance_name: string; display_name?: string | null; phone_number?: string | null } | null;
  } | null;
  // Removed: departments, tags, statuses - now using hooks directly
  members: Array<{ id: string; full_name: string }>;
  automations: Automation[];
  onClose: () => void;
  onEditName: () => void;
  onSaveName?: (name: string) => Promise<void>;
  onTransferHandler: (handler: 'ai' | 'human', assignedTo?: string | null, automationId?: string | null) => void;
  onChangeDepartment: (deptId: string | null) => void;
  onChangeStatus?: (statusId: string | null) => void;
  onChangeTags?: (tagNames: string[]) => void;
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function ContactDetailsPanel({
  conversation,
  members,
  automations,
  onClose,
  onEditName,
  onSaveName,
  onTransferHandler,
  onChangeDepartment,
  onChangeStatus,
  onChangeTags,
}: ContactDetailsPanelProps) {
  const queryClient = useQueryClient();
  
  // Use hooks directly to ensure consistent data (same as ContactStatusTags)
  const { statuses: allStatuses } = useCustomStatuses();
  const { departments: allDepartments } = useDepartments();
  const { tags: allTags } = useTags();
  
  // Filter active items only
  const statuses = useMemo(() => allStatuses.filter(s => s.is_active), [allStatuses]);
  const departments = useMemo(() => allDepartments.filter(d => d.is_active), [allDepartments]);
  const tags = useMemo(() => allTags, [allTags]); // Tags don't have is_active
  
  // Client ID for actions
  const clientId = conversation?.client?.id;
  
  // Hook for creating client actions (activity log)
  const { createAction } = useClientActions(clientId);
  
  // Main panel tab
  const [mainTab, setMainTab] = useState<"info" | "favorites" | "media" | "tasks" | "docs" | "copy">("info");
  
  // Inline name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  
  // Avatar refresh state
  const [isRefreshingAvatar, setIsRefreshingAvatar] = useState(false);
  
  // Sub-tabs
  const [favoritesSubTab, setFavoritesSubTab] = useState<"favorites" | "notes">("favorites");
  const [mediaSubTab, setMediaSubTab] = useState<"images" | "videos" | "docs" | "cloud">("images");
  
  // State
  const [infoOpen, setInfoOpen] = useState(false);
  const [attendantPopoverOpen, setAttendantPopoverOpen] = useState(false);
  const [attendantSearch, setAttendantSearch] = useState("");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [cloudFiles, setCloudFiles] = useState<Array<{ name: string; url: string; created_at: string }>>([]);
  const [starredMessages, setStarredMessages] = useState<StarredMessage[]>([]);
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);
  
  // Collapsible states for properties
  const [statusOpen, setStatusOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Client tags state
  const [clientTagIds, setClientTagIds] = useState<string[]>([]);

  // Fetch client tags
  const fetchClientTags = useCallback(async (cId: string) => {
    const { data } = await supabase
      .from("client_tags")
      .select("tag_id")
      .eq("client_id", cId);
    setClientTagIds((data || []).map((t) => t.tag_id));
  }, []);

  useEffect(() => {
    if (clientId) {
      fetchClientTags(clientId);
    } else {
      setClientTagIds([]);
    }
  }, [clientId, fetchClientTags]);

  // Fetch starred messages
  useEffect(() => {
    if (!conversation?.id || mainTab !== "favorites") return;
    
    const fetchStarred = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, content, created_at, is_from_me")
        .eq("conversation_id", conversation.id)
        .eq("is_starred", true)
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (data) {
        setStarredMessages(data.map(m => ({
          id: m.id,
          content: m.content,
          created_at: m.created_at,
          is_from_me: m.is_from_me,
          sender_name: null,
        })));
      }
    };
    
    fetchStarred();
  }, [conversation?.id, mainTab]);

  // Fetch internal notes (messages with is_internal = true)
  useEffect(() => {
    if (!conversation?.id || mainTab !== "favorites") return;
    
    const fetchNotes = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, content, created_at")
        .eq("conversation_id", conversation.id)
        .eq("is_internal", true)
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (data) {
        setInternalNotes(data.map(n => ({
          id: n.id,
          content: n.content || "",
          created_at: n.created_at,
          sender_name: null,
        })));
      }
    };
    
    fetchNotes();
  }, [conversation?.id, mainTab]);

  // Fetch media items
  useEffect(() => {
    if (!conversation?.id) return;
    
    const fetchMedia = async () => {
      setMediaLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("id, media_url, media_mime_type, message_type, created_at, whatsapp_message_id, content, conversation_id")
        .eq("conversation_id", conversation.id)
        .in("message_type", ["image", "video", "audio", "ptt", "document"])
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (!error && data) {
        setMediaItems(data as MediaItem[]);
      }
      setMediaLoading(false);
    };
    
    fetchMedia();

    const channel = supabase
      .channel(`media-updates-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`
        },
        (payload) => {
          const newMsg = payload.new as MediaItem;
          if (newMsg.message_type && ["image", "video", "audio", "ptt", "document"].includes(newMsg.message_type)) {
            setMediaItems(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [newMsg, ...prev].slice(0, 50);
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`
        },
        (payload) => {
          const updatedMsg = payload.new as MediaItem;
          if (updatedMsg.message_type && ["image", "video", "audio", "ptt", "document"].includes(updatedMsg.message_type)) {
            setMediaItems(prev => prev.map(m => 
              m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m
            ));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  // Fetch cloud files
  useEffect(() => {
    if (!conversation?.id || mainTab !== "media" || mediaSubTab !== "cloud") return;
    
    const fetchCloudFiles = async () => {
      setMediaLoading(true);
      const { data, error } = await supabase
        .storage
        .from("chat-media")
        .list(conversation.id, { limit: 50, sortBy: { column: "created_at", order: "desc" } });
      
      if (!error && data) {
        const files = data.map(file => ({
          name: file.name,
          url: supabase.storage.from("chat-media").getPublicUrl(`${conversation.id}/${file.name}`).data.publicUrl,
          created_at: file.created_at || new Date().toISOString(),
        }));
        setCloudFiles(files);
      }
      setMediaLoading(false);
    };
    
    fetchCloudFiles();
  }, [conversation?.id, mainTab, mediaSubTab]);

  // Filter media by type
  const filteredMedia = useMemo(() => {
    return mediaItems.filter(item => {
      const mimeType = item.media_mime_type?.toLowerCase() || "";
      const msgType = item.message_type?.toLowerCase() || "";
      
      if (mediaSubTab === "images") {
        return mimeType.includes("image") || msgType === "image";
      }
      if (mediaSubTab === "videos") {
        return mimeType.includes("video") || msgType === "video";
      }
      if (mediaSubTab === "docs") {
        return mimeType.includes("pdf") || mimeType.includes("document") || 
               mimeType.includes("text") || mimeType.includes("application") ||
               msgType === "document" || msgType === "audio" || msgType === "ptt";
      }
      return false;
    });
  }, [mediaItems, mediaSubTab]);

  // Get current status
  const currentStatus = useMemo(() => {
    if (!conversation?.client?.custom_status_id) return null;
    return statuses.find(s => s.id === conversation.client?.custom_status_id);
  }, [conversation?.client?.custom_status_id, statuses]);

  // Get current department
  const currentDepartment = useMemo(() => {
    if (!conversation?.department_id) return null;
    return departments.find(d => d.id === conversation.department_id);
  }, [conversation?.department_id, departments]);

  // Get current tags
  const conversationTags = useMemo(() => {
    return clientTagIds
      .map(tagId => tags.find(t => t.id === tagId))
      .filter(Boolean) as Array<{ id: string; name: string; color: string }>;
  }, [clientTagIds, tags]);

  // Filtered members for search
  const filteredMembers = useMemo(() => {
    if (!attendantSearch) return members;
    return members.filter(m => 
      m.full_name.toLowerCase().includes(attendantSearch.toLowerCase())
    );
  }, [members, attendantSearch]);

  // Filtered automations for search
  const filteredAutomations = useMemo(() => {
    if (!attendantSearch) return automations;
    return automations.filter(a => 
      a.name.toLowerCase().includes(attendantSearch.toLowerCase())
    );
  }, [automations, attendantSearch]);

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Selecione uma conversa</p>
      </div>
    );
  }

  const handleTagToggle = async (tag: { id: string; name: string }) => {
    if (!clientId) return;
    
    const hasTag = clientTagIds.includes(tag.id);
    
    if (hasTag) {
      await supabase
        .from("client_tags")
        .delete()
        .eq("client_id", clientId)
        .eq("tag_id", tag.id);
      
      // Log tag removal action for chat activity
      createAction.mutate({
        client_id: clientId,
        action_type: "tag_remove",
        from_value: tag.name,
        description: `removeu a tag ${tag.name}`,
      });
      
      setClientTagIds((prev) => prev.filter((id) => id !== tag.id));
    } else {
      if (clientTagIds.length >= 4) return;
      
      await supabase.from("client_tags").insert({
        client_id: clientId,
        tag_id: tag.id,
      });
      
      // Log tag addition action for chat activity
      createAction.mutate({
        client_id: clientId,
        action_type: "tag_add",
        to_value: tag.name,
        description: `adicionou a tag ${tag.name}`,
      });
      
      setClientTagIds((prev) => [...prev, tag.id]);
    }
    
    queryClient.invalidateQueries({ queryKey: ["client_tags", clientId] });
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  const handleStatusSelect = (statusId: string) => {
    const isSelected = currentStatus?.id === statusId;
    const newStatusId = isSelected ? null : statusId;
    
    // Get status names for logging
    const fromStatusName = currentStatus?.name || "Sem status";
    const toStatus = statuses.find(s => s.id === statusId);
    const toStatusName = isSelected ? "Sem status" : (toStatus?.name || "Desconhecido");
    
    // Call parent handler to update status
    onChangeStatus?.(newStatusId);
    
    // Log status change action for chat activity
    if (clientId && fromStatusName !== toStatusName) {
      createAction.mutate({
        client_id: clientId,
        action_type: "status_change",
        from_value: fromStatusName,
        to_value: toStatusName,
        description: `alterou o status de ${fromStatusName} para ${toStatusName}`,
      });
    }
    
    setStatusOpen(false);
  };

  const handleDepartmentSelect = (deptId: string) => {
    const isSelected = currentDepartment?.id === deptId;
    onChangeDepartment(isSelected ? null : deptId);
    setDepartmentOpen(false);
  };

  // Handle refresh avatar
  const handleRefreshAvatar = async () => {
    if (!conversation?.client?.id || !conversation?.contact_phone || !conversation?.whatsapp_instance?.id) {
      toast({
        title: "Não é possível atualizar",
        description: "Informações de cliente ou instância não disponíveis",
        variant: "destructive",
      });
      return;
    }

    setIsRefreshingAvatar(true);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "fetch_profile_picture",
          instanceId: conversation.whatsapp_instance.id,
          phoneNumber: conversation.contact_phone.replace(/\D/g, ""),
          clientId: conversation.client.id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: "Foto atualizada!" });
        queryClient.invalidateQueries({ queryKey: ["clients"] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      } else {
        toast({
          title: "Foto não disponível",
          description: data?.message || "O usuário pode ter privacidade ativada",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro ao atualizar foto",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsRefreshingAvatar(false);
    }
  };

  const handleCopyPhone = () => {
    if (conversation.contact_phone) {
      navigator.clipboard.writeText(conversation.contact_phone);
      toast({ title: "Telefone copiado!" });
    }
  };

  const handleCopyName = () => {
    if (conversation.contact_name) {
      navigator.clipboard.writeText(conversation.contact_name);
      toast({ title: "Nome copiado!" });
    }
  };

  const handleStartEditName = () => {
    setEditedName(conversation.contact_name || conversation.contact_phone || "");
    setIsEditingName(true);
  };

  const handleSaveInlineName = async () => {
    if (editedName.trim() && onSaveName) {
      try {
        await onSaveName(editedName.trim());
        setIsEditingName(false);
        toast({ title: "Nome atualizado!" });
      } catch (error) {
        toast({ title: "Erro ao salvar nome", variant: "destructive" });
      }
    } else if (editedName.trim()) {
      // Fallback to old method
      onEditName();
      setIsEditingName(false);
    }
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName("");
  };

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <span className="text-sm text-muted-foreground">Fechar painel</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Main Icon Tabs */}
      <div className="border-b border-border flex-shrink-0">
        <div className="flex items-center justify-around px-2 py-2">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 rounded-lg",
              mainTab === "info" && "bg-primary/10 text-primary"
            )}
            onClick={() => setMainTab("info")}
          >
            <User className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 rounded-lg",
              mainTab === "favorites" && "bg-primary/10 text-primary"
            )}
            onClick={() => setMainTab("favorites")}
          >
            <Star className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 rounded-lg",
              mainTab === "media" && "bg-primary/10 text-primary"
            )}
            onClick={() => setMainTab("media")}
          >
            <ImageIcon className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 rounded-lg",
              mainTab === "tasks" && "bg-primary/10 text-primary"
            )}
            onClick={() => setMainTab("tasks")}
          >
            <CheckSquare className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 rounded-lg",
              mainTab === "docs" && "bg-primary/10 text-primary"
            )}
            onClick={() => setMainTab("docs")}
          >
            <FileText className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 rounded-lg",
              mainTab === "copy" && "bg-primary/10 text-primary"
            )}
            onClick={() => setMainTab("copy")}
          >
            <Copy className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {/* Info Tab */}
        {mainTab === "info" && (
          <div className="p-4 space-y-4">
            {/* Contact Card */}
            <div className="text-center space-y-3">
              <div className="relative inline-block mx-auto">
                <Avatar className="h-20 w-20">
                  {conversation.client?.avatar_url ? (
                    <AvatarImage 
                      src={conversation.client.avatar_url} 
                      alt={conversation.contact_name || "Avatar"}
                    />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
                    {getInitials(conversation.contact_name)}
                  </AvatarFallback>
                </Avatar>
                
                {/* Refresh Avatar Button */}
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-background border shadow-sm hover:bg-muted"
                  onClick={handleRefreshAvatar}
                  disabled={isRefreshingAvatar || !conversation?.client?.id || !conversation?.whatsapp_instance?.id}
                  title="Atualizar foto de perfil do WhatsApp"
                >
                  {isRefreshingAvatar ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              
              <div>
                {isEditingName ? (
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="bg-transparent border-b border-primary text-center font-semibold text-lg focus:outline-none max-w-[200px]"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveInlineName();
                        if (e.key === 'Escape') handleCancelEditName();
                      }}
                      onBlur={handleSaveInlineName}
                    />
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={handleSaveInlineName}
                    >
                      <Check className="h-3 w-3 text-green-600" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={handleCancelEditName}
                    >
                      <X className="h-3 w-3 text-red-600" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1">
                    <h4 
                      className="font-semibold text-lg cursor-pointer hover:text-primary transition-colors"
                      onClick={handleStartEditName}
                      title="Clique para editar"
                    >
                      {conversation.contact_name || conversation.contact_phone || "Sem nome"}
                    </h4>
                  </div>
                )}
                <p className="text-sm text-muted-foreground flex items-center justify-center gap-1 mt-1">
                  <Phone className="h-3 w-3" />
                  {conversation.contact_phone || "---"}
                </p>
              </div>
            </div>

            <Separator />

            {/* Atendimento Section */}
            <div className="space-y-3">
              <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Atendimento
              </h5>

              <div className="space-y-2">
                <Popover open={attendantPopoverOpen} onOpenChange={setAttendantPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={attendantPopoverOpen}
                      className="w-full justify-start h-auto py-2 px-3"
                    >
                      <Users className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {conversation.current_handler === "ai" ? (
                          <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-0 truncate">
                            <Bot className="h-3 w-3 mr-1 flex-shrink-0" />
                            <span className="truncate max-w-[120px]">
                              {`IA · ${conversation.current_automation?.name || automations.find(a => a.id === conversation.current_automation_id)?.name || "Assistente"}`}
                            </span>
                          </Badge>
                        ) : conversation.assigned_to ? (
                          <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-0 truncate">
                            <User className="h-3 w-3 mr-1 flex-shrink-0" />
                            <span className="truncate max-w-[120px]">
                              {conversation.assigned_profile?.full_name || "Atendente"}
                            </span>
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-muted text-muted-foreground border-0 truncate">
                            <User className="h-3 w-3 mr-1 flex-shrink-0" />
                            <span className="truncate max-w-[120px]">Sem responsável</span>
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground ml-1 flex-shrink-0">Buscar</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput 
                        placeholder="Buscar responsável..." 
                        value={attendantSearch}
                        onValueChange={setAttendantSearch}
                      />
                      <CommandList>
                        <CommandEmpty>Nenhum responsável encontrado.</CommandEmpty>
                        
                        <CommandGroup heading="Sem atribuição">
                          <CommandItem
                            value="nenhum"
                            onSelect={() => {
                              onTransferHandler("human", null, null);
                              setAttendantPopoverOpen(false);
                              setAttendantSearch("");
                            }}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <User className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="flex flex-col">
                                <span>Nenhum</span>
                                <span className="text-[10px] text-muted-foreground">Sem responsável atribuído</span>
                              </div>
                            </div>
                            {conversation.current_handler === "human" && 
                             !conversation.assigned_to && (
                              <Check className="h-4 w-4 text-primary" />
                            )}
                          </CommandItem>
                        </CommandGroup>

                        {filteredAutomations.length > 0 && (
                          <CommandGroup heading="Agentes IA">
                            {filteredAutomations.map(automation => (
                              <CommandItem
                                key={automation.id}
                                value={`ai-${automation.name}`}
                                onSelect={() => {
                                  onTransferHandler("ai", null, automation.id);
                                  setAttendantPopoverOpen(false);
                                  setAttendantSearch("");
                                }}
                                className="flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                    <Zap className="h-4 w-4 text-purple-600" />
                                  </div>
                                  <div className="flex flex-col">
                                    <span>{automation.name}</span>
                                    {automation.is_active && (
                                      <span className="text-[10px] text-green-600">Ativo</span>
                                    )}
                                  </div>
                                </div>
                                {conversation.current_handler === "ai" && 
                                 conversation.current_automation_id === automation.id && (
                                  <Check className="h-4 w-4 text-primary" />
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}

                        <CommandGroup heading="Atendentes">
                          {filteredMembers.map(member => (
                            <CommandItem
                              key={member.id}
                              value={member.full_name}
                              onSelect={() => {
                                onTransferHandler("human", member.id);
                                setAttendantPopoverOpen(false);
                                setAttendantSearch("");
                              }}
                              className="flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700">
                                    {getInitials(member.full_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span>{member.full_name}</span>
                              </div>
                              {conversation.current_handler === "human" && 
                               conversation.assigned_to === member.id && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </CommandItem>
                          ))}
                          {filteredMembers.length === 0 && (
                            <div className="py-2 px-4 text-xs text-muted-foreground">
                              Nenhum atendente cadastrado
                            </div>
                          )}
                        </CommandGroup>
                      </CommandList>
                      <div className="p-2 border-t text-xs text-muted-foreground">
                        Use ↑↓ para navegar, ↵ para selecionar, Esc para fechar
                      </div>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <Separator />

            {/* Propriedades Section */}
            <div className="space-y-3">
              <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Propriedades
              </h5>

              {/* Status */}
              <Collapsible open={statusOpen} onOpenChange={setStatusOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-auto py-2.5 px-3 hover:bg-muted/50 overflow-hidden rounded-lg border border-transparent hover:border-border"
                  >
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      <CircleDot className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Status</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                      {currentStatus && (
                        <Badge
                          variant="outline"
                          className="text-xs truncate max-w-[100px]"
                          style={{
                            borderColor: currentStatus.color,
                            backgroundColor: `${currentStatus.color}30`,
                            color: currentStatus.color,
                          }}
                        >
                          <span className="truncate">{currentStatus.name}</span>
                        </Badge>
                      )}
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform", statusOpen && "rotate-180")} />
                    </div>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1">
                  <div className="max-h-[60vh] overflow-y-auto pr-2 overscroll-contain">
                    <div className="space-y-0.5 pl-2">
                      {statuses.map(status => {
                        const isSelected = currentStatus?.id === status.id;
                        return (
                          <button
                            key={status.id}
                            onClick={() => handleStatusSelect(status.id)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                              "hover:bg-muted/50",
                              isSelected && "bg-muted/50"
                            )}
                          >
                            <div 
                              className={cn(
                                "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                                isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                              )}
                            >
                              {isSelected && (
                                <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                              )}
                            </div>
                            <span 
                              className="text-sm truncate"
                              style={{ color: status.color }}
                            >
                              {status.name}
                            </span>
                          </button>
                        );
                      })}
                      {statuses.length === 0 && (
                        <span className="text-xs text-muted-foreground px-3 py-2 block">Nenhum status cadastrado</span>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Tags */}
              <Collapsible open={tagsOpen} onOpenChange={setTagsOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-auto py-2.5 px-3 hover:bg-muted/50 rounded-lg border border-transparent hover:border-border"
                  >
                    <div className="flex items-center gap-2.5">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Etiquetas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {conversationTags.length > 0 && (
                        <div className="flex gap-1 flex-wrap max-w-[150px]">
                          {conversationTags.slice(0, 2).map(tag => (
                            <Badge
                              key={tag.id}
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                              style={{
                                borderColor: tag.color,
                                backgroundColor: `${tag.color}30`,
                                color: tag.color,
                              }}
                            >
                              {tag.name}
                            </Badge>
                          ))}
                          {conversationTags.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{conversationTags.length - 2}</span>
                          )}
                        </div>
                      )}
                      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", tagsOpen && "rotate-180")} />
                    </div>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1">
                  <div className="max-h-[60vh] overflow-y-auto pr-2 overscroll-contain">
                    <div className="space-y-0.5 pl-2">
                      {tags.map(tag => {
                        const isSelected = conversationTags.some(t => t.id === tag.id);
                        const isDisabled = !isSelected && conversationTags.length >= 4;
                        return (
                          <button
                            key={tag.id}
                            onClick={() => !isDisabled && handleTagToggle(tag)}
                            disabled={isDisabled}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                              "hover:bg-muted/50",
                              isSelected && "bg-muted/50",
                              isDisabled && "opacity-40 cursor-not-allowed"
                            )}
                          >
                            <div 
                              className={cn(
                                "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                                isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                              )}
                            >
                              {isSelected && (
                                <Check className="h-3 w-3 text-primary-foreground" />
                              )}
                            </div>
                            <span 
                              className="text-sm truncate"
                              style={{ color: tag.color }}
                            >
                              {tag.name}
                            </span>
                          </button>
                        );
                      })}
                      {tags.length === 0 && (
                        <span className="text-xs text-muted-foreground px-3 py-2 block">Nenhuma etiqueta cadastrada</span>
                      )}
                    </div>
                  </div>
                  {conversationTags.length >= 4 && (
                    <p className="text-[10px] text-muted-foreground mt-1 px-3">Máximo de 4 etiquetas</p>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Department */}
              <Collapsible open={departmentOpen} onOpenChange={setDepartmentOpen}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-auto py-2.5 px-3 hover:bg-muted/50 overflow-hidden rounded-lg border border-transparent hover:border-border"
                  >
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      <Folder className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Departamento</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                      {currentDepartment && (
                        <Badge
                          variant="outline"
                          className="text-xs truncate max-w-[100px]"
                          style={{
                            borderColor: currentDepartment.color,
                            backgroundColor: `${currentDepartment.color}30`,
                            color: currentDepartment.color,
                          }}
                        >
                          <span className="truncate">{currentDepartment.name}</span>
                        </Badge>
                      )}
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform", departmentOpen && "rotate-180")} />
                    </div>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1">
                  <div className="max-h-[60vh] overflow-y-auto pr-2 overscroll-contain">
                    <div className="space-y-0.5 pl-2">
                      {departments.map(dept => {
                        const isSelected = currentDepartment?.id === dept.id;
                        return (
                          <button
                            key={dept.id}
                            onClick={() => handleDepartmentSelect(dept.id)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                              "hover:bg-muted/50",
                              isSelected && "bg-muted/50"
                            )}
                          >
                            <div 
                              className={cn(
                                "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                                isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                              )}
                            >
                              {isSelected && (
                                <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                              )}
                            </div>
                            <span 
                              className="text-sm truncate"
                              style={{ color: dept.color }}
                            >
                              {dept.name}
                            </span>
                          </button>
                        );
                      })}
                      {departments.length === 0 && (
                        <span className="text-xs text-muted-foreground px-3 py-2 block">Nenhum departamento cadastrado</span>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* AI Summary Section */}
            {conversation.ai_summary && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-between h-auto py-2 px-2 hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Resumo IA</span>
                        </div>
                        {summaryOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="bg-muted/50 rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {conversation.ai_summary}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </>
            )}

            <Separator />

            {/* Ver mais - Info Section */}
            <Collapsible open={infoOpen} onOpenChange={setInfoOpen}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between h-9 px-2 text-muted-foreground"
                >
                  <span className="text-sm">Ver mais</span>
                  {infoOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                {conversation.client?.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{conversation.client.email}</span>
                  </div>
                )}
                
                {conversation.client?.address && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{conversation.client.address}</span>
                  </div>
                )}
                
                {conversation.client?.document && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{conversation.client.document}</span>
                  </div>
                )}
                
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Criado {formatDistanceToNow(new Date(conversation.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
                
                {conversation.last_message_at && (
                  <div className="flex items-center gap-2 text-sm">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Última msg {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                )}

                {conversation.whatsapp_instance && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {conversation.whatsapp_instance.display_name || conversation.whatsapp_instance.instance_name}
                      {conversation.whatsapp_instance.phone_number && (
                        <span className="text-muted-foreground ml-1">
                          ({conversation.whatsapp_instance.phone_number.slice(-4)})
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {conversation.client?.notes && (
                  <>
                    <Separator className="my-2" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium">Observações</h4>
                      <p className="text-sm text-muted-foreground">{conversation.client.notes}</p>
                    </div>
                  </>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Favorites/Notes Tab */}
        {mainTab === "favorites" && (
          <div className="p-4 space-y-4">
            <Tabs value={favoritesSubTab} onValueChange={(v) => setFavoritesSubTab(v as "favorites" | "notes")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="favorites" className="text-sm">
                  Favoritos
                </TabsTrigger>
                <TabsTrigger value="notes" className="text-sm">
                  Notas
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="favorites" className="mt-4">
                {starredMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Heart className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nenhuma mensagem favorita</p>
                    <p className="text-xs text-center mt-1 max-w-[200px]">
                      Use "Favoritar mensagem" no menu de uma mensagem para adicionar aos favoritos
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {starredMessages.map(msg => (
                      <div 
                        key={msg.id}
                        className={cn(
                          "p-3 rounded-lg text-sm",
                          msg.is_from_me ? "bg-primary/10" : "bg-muted/50"
                        )}
                      >
                        <p className="text-xs text-muted-foreground mb-1 text-right">
                          {msg.sender_name || (msg.is_from_me ? "Você" : conversation.contact_name)}
                        </p>
                        <p className="break-words">{msg.content || "[Mídia]"}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Copy className="h-3 w-3 cursor-pointer hover:text-foreground" onClick={() => {
                            if (msg.content) {
                              navigator.clipboard.writeText(msg.content);
                              toast({ title: "Copiado!" });
                            }
                          }} />
                          <span>{format(new Date(msg.created_at), "HH:mm:ss dd/MM", { locale: ptBR })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="notes" className="mt-4">
                {internalNotes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <StickyNote className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nenhuma nota interna</p>
                    <p className="text-xs text-center mt-1 max-w-[200px]">
                      As notas internas aparecem aqui
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {internalNotes.map(note => (
                      <div 
                        key={note.id}
                        className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm"
                      >
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-1 text-right">
                          {note.sender_name || "Sistema"}
                        </p>
                        <p className="break-words">{note.content}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Copy className="h-3 w-3 cursor-pointer hover:text-foreground" onClick={() => {
                            navigator.clipboard.writeText(note.content);
                            toast({ title: "Copiado!" });
                          }} />
                          <span>{format(new Date(note.created_at), "HH:mm:ss dd/MM", { locale: ptBR })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Media Tab */}
        {mainTab === "media" && (
          <div className="p-4 space-y-4">
            <Tabs value={mediaSubTab} onValueChange={(v) => setMediaSubTab(v as "images" | "videos" | "docs" | "cloud")}>
              <TabsList className="grid w-full grid-cols-4 h-8">
                <TabsTrigger value="images" className="text-xs h-7 gap-1 px-1">
                  Imagens
                </TabsTrigger>
                <TabsTrigger value="videos" className="text-xs h-7 gap-1 px-1">
                  Vídeos
                </TabsTrigger>
                <TabsTrigger value="docs" className="text-xs h-7 gap-1 px-1">
                  Docs
                </TabsTrigger>
                <TabsTrigger value="cloud" className="text-xs h-7 gap-1 px-1">
                  Nuvem
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value={mediaSubTab} className="mt-4">
                {mediaLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                  </div>
                ) : mediaSubTab === "cloud" ? (
                  cloudFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Cloud className="h-8 w-8 mb-2 opacity-50" />
                      <span className="text-sm">Nenhum arquivo na nuvem</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cloudFiles.map((file, index) => (
                        <a 
                          key={index}
                          href={file.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <Cloud className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs truncate">{file.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(file.created_at), { addSuffix: true, locale: ptBR })}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  )
                ) : filteredMedia.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    {mediaSubTab === "images" && <ImageIcon className="h-8 w-8 mb-2 opacity-50" />}
                    {mediaSubTab === "videos" && <Video className="h-8 w-8 mb-2 opacity-50" />}
                    {mediaSubTab === "docs" && <File className="h-8 w-8 mb-2 opacity-50" />}
                    <span className="text-sm">Nenhuma mídia encontrada</span>
                  </div>
                ) : (
                  <div className={cn(
                    "gap-2",
                    (mediaSubTab === "images" || mediaSubTab === "videos") ? "grid grid-cols-3" : "space-y-2"
                  )}>
                    {filteredMedia.map((item, index) => (
                      <div key={item.id}>
                        {(mediaSubTab === "images" || mediaSubTab === "videos") ? (
                          <MediaGalleryItem
                            mediaUrl={item.media_url}
                            whatsappMessageId={item.whatsapp_message_id}
                            conversationId={item.conversation_id}
                            content={item.content}
                            allImages={filteredMedia.map(img => ({
                              mediaUrl: img.media_url,
                              whatsappMessageId: img.whatsapp_message_id,
                              content: img.content
                            }))}
                            currentIndex={index}
                          />
                        ) : (
                          <DecryptedMediaListItem
                            kind="document"
                            mediaUrl={item.media_url}
                            mimeType={item.media_mime_type}
                            whatsappMessageId={item.whatsapp_message_id}
                            conversationId={item.conversation_id}
                            content={item.content}
                            createdAt={item.created_at}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Tasks Tab */}
        {mainTab === "tasks" && (
          <div className="p-4">
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CheckSquare className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Em breve</p>
              <p className="text-xs text-center mt-1 max-w-[200px]">
                Funcionalidade de tarefas será implementada em breve
              </p>
            </div>
          </div>
        )}

        {/* Docs Tab */}
        {mainTab === "docs" && (
          <div className="p-4">
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Em breve</p>
              <p className="text-xs text-center mt-1 max-w-[200px]">
                Funcionalidade de documentos será implementada em breve
              </p>
            </div>
          </div>
        )}

        {/* Copy Tab */}
        {mainTab === "copy" && (
          <div className="p-4 space-y-4">
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Copiar informações
            </h5>
            
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleCopyPhone}
                disabled={!conversation.contact_phone}
              >
                <Phone className="h-4 w-4 mr-2" />
                Copiar telefone
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleCopyName}
                disabled={!conversation.contact_name}
              >
                <User className="h-4 w-4 mr-2" />
                Copiar nome
              </Button>
              
              {conversation.client?.email && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    navigator.clipboard.writeText(conversation.client!.email!);
                    toast({ title: "E-mail copiado!" });
                  }}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Copiar e-mail
                </Button>
              )}
              
              {conversation.client?.document && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    navigator.clipboard.writeText(conversation.client!.document!);
                    toast({ title: "Documento copiado!" });
                  }}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Copiar documento
                </Button>
              )}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
