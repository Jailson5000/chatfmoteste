import { useState, useMemo, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Automation {
  id: string;
  name: string;
  is_active: boolean;
}

interface MediaItem {
  id: string;
  media_url: string;
  media_mime_type: string | null;
  message_type: string;
  created_at: string;
}

interface ContactDetailsPanelProps {
  conversation: {
    id: string;
    contact_name: string | null;
    contact_phone: string | null;
    current_handler: 'ai' | 'human';
    current_automation_id?: string | null;
    // Joined automation data - use this for name display instead of lookup
    current_automation?: { id: string; name: string } | null;
    department_id: string | null;
    tags: string[] | null;
    created_at: string;
    last_message_at: string | null;
    assigned_to?: string | null;
    ai_summary?: string | null;
    client?: {
      id?: string;
      email?: string | null;
      address?: string | null;
      document?: string | null;
      notes?: string | null;
      custom_status_id?: string | null;
    } | null;
    assigned_profile?: { full_name: string } | null;
    whatsapp_instance?: { instance_name: string; display_name?: string | null; phone_number?: string | null } | null;
  } | null;
  departments: Array<{ id: string; name: string; color: string }>;
  tags: Array<{ id: string; name: string; color: string }>;
  statuses: Array<{ id: string; name: string; color: string }>;
  members: Array<{ id: string; full_name: string }>;
  automations: Automation[];
  onClose: () => void;
  onEditName: () => void;
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
  departments,
  tags,
  statuses,
  members,
  automations,
  onClose,
  onEditName,
  onTransferHandler,
  onChangeDepartment,
  onChangeStatus,
  onChangeTags,
}: ContactDetailsPanelProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [attendantPopoverOpen, setAttendantPopoverOpen] = useState(false);
  const [attendantSearch, setAttendantSearch] = useState("");
  const [mediaTab, setMediaTab] = useState<"images" | "audio" | "docs" | "cloud">("images");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [cloudFiles, setCloudFiles] = useState<Array<{ name: string; url: string; created_at: string }>>([]);
  
  // Collapsible states for properties
  const [statusOpen, setStatusOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Fetch media items when conversation changes
  useEffect(() => {
    if (!conversation?.id) return;
    
    const fetchMedia = async () => {
      setMediaLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("id, media_url, media_mime_type, message_type, created_at")
        .eq("conversation_id", conversation.id)
        .not("media_url", "is", null)
        .order("created_at", { ascending: false });
      
      if (!error && data) {
        setMediaItems(data as MediaItem[]);
      }
      setMediaLoading(false);
    };
    
    fetchMedia();
  }, [conversation?.id]);

  // Fetch cloud files from storage
  useEffect(() => {
    if (!conversation?.id || mediaTab !== "cloud") return;
    
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
  }, [conversation?.id, mediaTab]);

  // Filter media by type
  const filteredMedia = useMemo(() => {
    return mediaItems.filter(item => {
      const mimeType = item.media_mime_type?.toLowerCase() || "";
      const msgType = item.message_type?.toLowerCase() || "";
      
      if (mediaTab === "images") {
        return mimeType.includes("image") || msgType === "image";
      }
      if (mediaTab === "audio") {
        return mimeType.includes("audio") || msgType === "audio" || msgType === "ptt";
      }
      if (mediaTab === "docs") {
        return mimeType.includes("pdf") || mimeType.includes("document") || 
               mimeType.includes("text") || mimeType.includes("application") ||
               msgType === "document";
      }
      return false;
    });
  }, [mediaItems, mediaTab]);

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

  // Get current tags (max 4)
  const conversationTags = useMemo(() => {
    if (!conversation?.tags) return [];
    return (conversation.tags || [])
      .map(tagName => tags.find(t => t.name === tagName || t.id === tagName))
      .filter(Boolean) as Array<{ id: string; name: string; color: string }>;
  }, [conversation?.tags, tags]);

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

  const handleTagToggle = (tag: { id: string; name: string }) => {
    if (!onChangeTags) return;
    
    const currentTagNames = conversation.tags || [];
    const hasTag = currentTagNames.includes(tag.name);
    
    if (hasTag) {
      onChangeTags(currentTagNames.filter(t => t !== tag.name));
    } else {
      // Max 4 tags
      if (currentTagNames.length >= 4) return;
      onChangeTags([...currentTagNames, tag.name]);
    }
  };

  const handleStatusSelect = (statusId: string) => {
    const isSelected = currentStatus?.id === statusId;
    onChangeStatus?.(isSelected ? null : statusId);
    setStatusOpen(false);
  };

  const handleDepartmentSelect = (deptId: string) => {
    const isSelected = currentDepartment?.id === deptId;
    onChangeDepartment(isSelected ? null : deptId);
    setDepartmentOpen(false);
  };

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4 overflow-hidden">
          {/* Contact Card */}
          <div className="text-center space-y-3">
            <Avatar className="h-20 w-20 mx-auto">
              <AvatarImage 
                src={`https://api.dicebear.com/7.x/initials/svg?seed=${conversation.contact_name || conversation.contact_phone}`} 
              />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
                {getInitials(conversation.contact_name)}
              </AvatarFallback>
            </Avatar>
            
            <div>
              <div className="flex items-center justify-center gap-1">
                <h4 className="font-semibold text-lg">
                  {conversation.contact_name || conversation.contact_phone || "Sem nome"}
                </h4>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={onEditName}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
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

            {/* Handler/Attendant Selector */}
            <div className="space-y-2">
              <Popover open={attendantPopoverOpen} onOpenChange={setAttendantPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={attendantPopoverOpen}
                    className="w-full justify-start h-auto py-2 overflow-hidden"
                  >
                    <Users className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                    <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                      {conversation.current_handler === "ai" ? (
                        <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-0 truncate max-w-full">
                          <Bot className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span className="truncate">
                            {`IA · ${conversation.current_automation?.name || automations.find(a => a.id === conversation.current_automation_id)?.name || "Assistente"}`}
                          </span>
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-0 truncate max-w-full">
                          <User className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span className="truncate">
                            {`Atendente · ${conversation.assigned_profile?.full_name || "Humano"}`}
                          </span>
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground ml-auto flex-shrink-0 hidden sm:inline">Buscar responsável...</span>
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
                      
                      {/* AI Agents Section */}
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

                      {/* Team Members Section */}
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

            {/* Status - Collapsible, single selection */}
            <Collapsible open={statusOpen} onOpenChange={setStatusOpen}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between h-auto py-2 px-2 hover:bg-muted/50 overflow-hidden"
                >
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <CircleDot className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Status</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                    {currentStatus ? (
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
                    ) : null}
                    {statusOpen ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 pl-6 space-y-1">
                {statuses.map(status => {
                  const isSelected = currentStatus?.id === status.id;
                  return (
                    <Badge
                      key={status.id}
                      variant="outline"
                      className={cn(
                        "cursor-pointer transition-all text-xs mr-1 mb-1",
                        isSelected 
                          ? "ring-2 ring-offset-1" 
                          : "opacity-70 hover:opacity-100"
                      )}
                      style={{
                        borderColor: status.color,
                        backgroundColor: isSelected ? `${status.color}30` : 'transparent',
                        color: status.color,
                      }}
                      onClick={() => handleStatusSelect(status.id)}
                    >
                      {status.name}
                    </Badge>
                  );
                })}
                {statuses.length === 0 && (
                  <span className="text-xs text-muted-foreground">Nenhum status cadastrado</span>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Tags - Collapsible, max 4 selections */}
            <Collapsible open={tagsOpen} onOpenChange={setTagsOpen}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between h-auto py-2 px-2 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Etiquetas</span>
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
                    {tagsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 pl-6">
                <div className="flex flex-wrap gap-1">
                  {tags.map(tag => {
                    const isSelected = conversationTags.some(t => t.id === tag.id);
                    const isDisabled = !isSelected && conversationTags.length >= 4;
                    return (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className={cn(
                          "cursor-pointer transition-all text-xs",
                          isSelected 
                            ? "ring-2 ring-offset-1" 
                            : isDisabled 
                              ? "opacity-30 cursor-not-allowed"
                              : "opacity-70 hover:opacity-100"
                        )}
                        style={{
                          borderColor: tag.color,
                          backgroundColor: isSelected ? `${tag.color}30` : 'transparent',
                          color: tag.color,
                        }}
                        onClick={() => !isDisabled && handleTagToggle(tag)}
                      >
                        {tag.name}
                      </Badge>
                    );
                  })}
                  {tags.length === 0 && (
                    <span className="text-xs text-muted-foreground">Nenhuma etiqueta cadastrada</span>
                  )}
                </div>
                {conversationTags.length >= 4 && (
                  <p className="text-[10px] text-muted-foreground mt-2">Máximo de 4 etiquetas</p>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Department - Collapsible, single selection */}
            <Collapsible open={departmentOpen} onOpenChange={setDepartmentOpen}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between h-auto py-2 px-2 hover:bg-muted/50 overflow-hidden"
                >
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Departamento</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                    {currentDepartment ? (
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
                    ) : null}
                    {departmentOpen ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 pl-6 space-y-1">
                {departments.map(dept => {
                  const isSelected = currentDepartment?.id === dept.id;
                  return (
                    <Badge
                      key={dept.id}
                      variant="outline"
                      className={cn(
                        "cursor-pointer transition-all text-xs mr-1 mb-1",
                        isSelected 
                          ? "ring-2 ring-offset-1" 
                          : "opacity-70 hover:opacity-100"
                      )}
                      style={{
                        borderColor: dept.color,
                        backgroundColor: isSelected ? `${dept.color}30` : 'transparent',
                        color: dept.color,
                      }}
                      onClick={() => handleDepartmentSelect(dept.id)}
                    >
                      {dept.name}
                    </Badge>
                  );
                })}
                {departments.length === 0 && (
                  <span className="text-xs text-muted-foreground">Nenhum departamento cadastrado</span>
                )}
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

          {/* Media Gallery Section */}
          <div className="space-y-3">
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Mídias
            </h5>
            
            <Tabs value={mediaTab} onValueChange={(v) => setMediaTab(v as "images" | "audio" | "docs" | "cloud")}>
              <TabsList className="grid w-full grid-cols-4 h-8">
                <TabsTrigger value="images" className="text-xs h-7 gap-1 px-1">
                  <ImageIcon className="h-3 w-3" />
                  Imagens
                </TabsTrigger>
                <TabsTrigger value="audio" className="text-xs h-7 gap-1 px-1">
                  <Music className="h-3 w-3" />
                  Áudio
                </TabsTrigger>
                <TabsTrigger value="docs" className="text-xs h-7 gap-1 px-1">
                  <File className="h-3 w-3" />
                  Docs
                </TabsTrigger>
                <TabsTrigger value="cloud" className="text-xs h-7 gap-1 px-1">
                  <Cloud className="h-3 w-3" />
                  Nuvem
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value={mediaTab} className="mt-3">
                {mediaLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                  </div>
                ) : mediaTab === "cloud" ? (
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
                    {mediaTab === "images" && <ImageIcon className="h-8 w-8 mb-2 opacity-50" />}
                    {mediaTab === "audio" && <Music className="h-8 w-8 mb-2 opacity-50" />}
                    {mediaTab === "docs" && <File className="h-8 w-8 mb-2 opacity-50" />}
                    <span className="text-sm">Nenhuma mídia encontrada</span>
                  </div>
                ) : (
                  <div className={cn(
                    "gap-2",
                    mediaTab === "images" ? "grid grid-cols-3" : "space-y-2"
                  )}>
                    {filteredMedia.map(item => (
                      <div key={item.id}>
                        {mediaTab === "images" ? (
                          <a 
                            href={item.media_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="block aspect-square rounded-md overflow-hidden bg-muted hover:opacity-80 transition-opacity"
                          >
                            <img 
                              src={item.media_url} 
                              alt="Media" 
                              className="w-full h-full object-cover"
                            />
                          </a>
                        ) : (
                          <a 
                            href={item.media_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                          >
                            {mediaTab === "audio" ? (
                              <Music className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs truncate">
                                {item.media_mime_type?.split("/")[1]?.toUpperCase() || mediaTab.toUpperCase()}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                              </p>
                            </div>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

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

              {/* Notes */}
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
      </ScrollArea>
    </div>
  );
}
