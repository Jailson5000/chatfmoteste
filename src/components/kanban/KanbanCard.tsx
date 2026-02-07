import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Bot, User, CheckCheck, Image, Mic, Video, FileText, Tag, Globe, Phone, Megaphone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface KanbanCardProps {
  conversation: {
    id: string;
    contact_name: string | null;
    contact_phone: string | null;
    status: string;
    current_handler: 'ai' | 'human';
    current_automation_id?: string | null;
    current_automation?: { id: string; name: string } | null;
    last_message_at: string | null;
    tags: string[] | null;
    department_id: string | null;
    last_message?: { 
      content: string | null; 
      created_at: string;
      message_type?: string;
      is_from_me?: boolean;
    } | null;
    whatsapp_instance?: { instance_name: string; display_name?: string | null; phone_number?: string | null } | null;
    assigned_profile?: { full_name: string } | null;
    unread_count?: number;
    client?: { custom_status_id?: string | null; avatar_url?: string | null } | null;
    origin?: string | null;
  };
  customStatus?: { name: string; color: string } | null;
  tags?: Array<{ id: string; name: string; color: string }>;
  automations?: Array<{ id: string; name: string; is_active: boolean }>;
  isDragging: boolean;
  onDragStart: () => void;
  onClick: () => void;
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function maskPhone(phone: string | null): string {
  if (!phone) return "----";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return `•••${digits}`;
  return `•••${digits.slice(-4)}`;
}

function getTimeAgo(date: string | null): string {
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
}

function getMessageIcon(type?: string) {
  switch (type) {
    case "image":
      return <Image className="h-3 w-3" />;
    case "audio":
      return <Mic className="h-3 w-3" />;
    case "video":
      return <Video className="h-3 w-3" />;
    case "document":
      return <FileText className="h-3 w-3" />;
    default:
      return null;
  }
}

function getMessageTypeLabel(type?: string): string {
  switch (type) {
    case "image":
      return "Imagem";
    case "audio":
      return "Áudio";
    case "video":
      return "Vídeo";
    case "document":
      return "Documento";
    default:
      return "";
  }
}

export function KanbanCard({ 
  conversation, 
  customStatus, 
  tags: allTags = [],
  automations = [],
  isDragging, 
  onDragStart, 
  onClick 
}: KanbanCardProps) {
  const maskedPhone = maskPhone(conversation.contact_phone);
  const timeAgo = getTimeAgo(conversation.last_message_at);
  
  // Get handler name (backend-first):
  // - AI with automation: IA · <automation name>
  // - AI without automation AND no assigned_to: "Sem responsável" (not really AI)
  // - Human with assignment: <full name>
  // - No assignment: "Sem responsável"
  const hasActiveAutomation = !!conversation.current_automation_id;
  const hasAssignment = !!conversation.assigned_profile?.full_name;
  
  // Only consider it AI-handled if there's actually an automation configured
  const isAI = conversation.current_handler === 'ai' && hasActiveAutomation;
  
  const automationName =
    conversation.current_automation?.name ||
    (conversation.current_automation_id
      ? automations.find((a) => a.id === conversation.current_automation_id)?.name
      : undefined);

  let handlerName: string;
  if (isAI && automationName) {
    handlerName = `IA · ${automationName}`;
  } else if (isAI) {
    handlerName = "IA";
  } else if (hasAssignment) {
    handlerName = conversation.assigned_profile!.full_name;
  } else {
    handlerName = "Sem responsável";
  }

  // Connection info: differentiate between Site (widget) and WhatsApp
  const getConnectionInfo = () => {
    const upperOrigin = conversation.origin?.toUpperCase();
    
    // Non-WhatsApp origins (Widget, Tray, Site, Web) -> Globe icon
    if (upperOrigin === 'WIDGET' || upperOrigin === 'TRAY' || upperOrigin === 'SITE' || upperOrigin === 'WEB') {
      return { 
        label: "Site", 
        isWidget: true,
        tooltipText: upperOrigin === 'WIDGET' ? 'Chat do Site' : upperOrigin
      };
    }
    
    // WhatsApp origin -> Phone icon with last 4 digits
    const phoneNumber = conversation.whatsapp_instance?.phone_number;
    if (phoneNumber) {
      const digits = phoneNumber.replace(/\D/g, "");
      if (digits.length >= 4) {
        return { 
          label: `•••${digits.slice(-4)}`,
          isWidget: false,
          tooltipText: conversation.whatsapp_instance?.display_name || conversation.whatsapp_instance?.instance_name || "WhatsApp"
        };
      }
    }
    
    return { label: "----", isWidget: false, tooltipText: "Canal não identificado" };
  };
  
  const connectionInfo = getConnectionInfo();
  
  // Get matched tags
  const conversationTags = (conversation.tags || [])
    .map(tagName => allTags.find(t => t.name === tagName || t.id === tagName))
    .filter(Boolean);

  const messageType = conversation.last_message?.message_type;
  const messageIcon = getMessageIcon(messageType);
  const messageLabel = getMessageTypeLabel(messageType);
  const isFromMe = conversation.last_message?.is_from_me;
  
  // Get message preview - clean up media patterns
  const getCleanPreview = () => {
    const rawContent = conversation.last_message?.content;
    if (!rawContent) {
      return messageType && messageType !== "text" ? messageLabel : "Sem mensagens";
    }
    
    // Check for media patterns [IMAGE]url, [VIDEO]url, etc.
    const mediaMatch = rawContent.match(/\[(IMAGE|VIDEO|AUDIO|DOCUMENT)\](https?:\/\/[^\s\n]+)/i);
    if (mediaMatch) {
      const type = mediaMatch[1].toUpperCase();
      // Get caption (text after the media pattern)
      const caption = rawContent.replace(/\[(IMAGE|VIDEO|AUDIO|DOCUMENT)\](https?:\/\/[^\s\n]+)/gi, "").trim();
      const mediaEmoji = type === "IMAGE" ? "📷" : type === "VIDEO" ? "🎬" : type === "AUDIO" ? "🎤" : "📄";
      const mediaLabel = type === "IMAGE" ? "Imagem" : type === "VIDEO" ? "Vídeo" : type === "AUDIO" ? "Áudio" : "Documento";
      return caption ? `${mediaEmoji} ${caption.slice(0, 35)}` : `${mediaEmoji} ${mediaLabel}`;
    }
    
    // For typed media without content
    if (messageType && messageType !== "text" && !rawContent.trim()) {
      return messageLabel;
    }
    
    return rawContent;
  };
  
  const messagePreview = getCleanPreview();

  const unreadCount = conversation.unread_count || 0;

  return (
    <div
      className={cn(
        "group relative rounded-lg bg-card border border-border/50 p-2.5 cursor-grab active:cursor-grabbing",
        "transition-all duration-200 hover:border-border hover:shadow-md hover:-translate-y-0.5",
        isDragging && "opacity-50 scale-95"
      )}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", conversation.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onClick={onClick}
    >
      {/* Unread Badge */}
      {unreadCount > 0 && (
        <div className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
          {unreadCount > 99 ? "99+" : unreadCount}
        </div>
      )}

      {/* Header: Avatar, Name, Phone, Time */}
      <div className="flex items-start gap-2">
        <Avatar className="h-8 w-8 border border-success/30">
          {conversation.client?.avatar_url ? (
            <AvatarImage 
              src={conversation.client.avatar_url} 
              alt={conversation.contact_name || "Avatar"} 
            />
          ) : null}
          <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
            {getInitials(conversation.contact_name)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <h4 className="font-medium text-xs truncate">
              {conversation.contact_name || conversation.contact_phone || "Sem nome"}
            </h4>
            <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground flex-shrink-0">
              <div className="w-1 h-1 rounded-full bg-success" />
              <span>{timeAgo}</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">{maskedPhone}</p>
        </div>
      </div>

      {/* Message Preview */}
      <div className="mt-1.5 flex items-start gap-1">
        {isFromMe && (
          <CheckCheck className="h-3 w-3 text-primary flex-shrink-0 mt-0.5" />
        )}
        {messageIcon && (
          <span className="text-muted-foreground flex-shrink-0 mt-0.5">{messageIcon}</span>
        )}
        <p className="text-[10px] text-muted-foreground line-clamp-1">
          {messagePreview}
        </p>
      </div>

      {/* Status Badge + Ad Badge */}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {/* Via Anúncio Badge */}
        {conversation.origin?.toUpperCase() === 'WHATSAPP_CTWA' && (
          <Badge 
            className="text-[10px] h-4 px-1.5 border-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          >
            <Megaphone className="h-2.5 w-2.5 mr-0.5" />
            Via Anúncio
          </Badge>
        )}
        
        {/* Status Badge */}
        {customStatus && (
          <Badge 
            className="text-[10px] h-4 px-1.5 border-0"
            style={{ 
              backgroundColor: `${customStatus.color}20`,
              color: customStatus.color 
            }}
          >
            {customStatus.name}
          </Badge>
        )}
      </div>

      {/* Footer: Tags, Instance, Handler */}
      <div className="mt-2 pt-1.5 border-t border-border/50 flex items-center gap-2">
        {/* Left: Tags + Instance (compact) */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
          {/* Tags icon with tooltip */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center cursor-pointer hover:text-foreground transition-colors">
                  <Tag className="h-2.5 w-2.5" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {conversationTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1 p-1">
                    {conversationTags.map((tag, idx) => (
                      <Badge
                        key={`tooltip-${tag?.name}-${idx}`}
                        className="text-xs h-5 px-2 border-0"
                        style={{ backgroundColor: `${tag?.color}40`, color: tag?.color }}
                      >
                        {tag?.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Sem etiquetas</span>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Connection icon: Globe for Site, Phone for WhatsApp */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center gap-0.5 cursor-pointer hover:text-foreground transition-colors",
                  connectionInfo.isWidget && "text-blue-500"
                )}>
                  {connectionInfo.isWidget ? (
                    <Globe className="h-2.5 w-2.5" />
                  ) : (
                    <Phone className="h-2.5 w-2.5" />
                  )}
                  <span>{connectionInfo.label}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span className="text-xs">{connectionInfo.tooltipText}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Handler (takes remaining space, aligns right) */}
        <div className="flex items-center gap-1 ml-auto min-w-0">
          {isAI ? (
            <Bot className="h-3 w-3 text-purple-500 flex-shrink-0" />
          ) : hasAssignment ? (
            <User className="h-3 w-3 text-success flex-shrink-0" />
          ) : (
            <User className="h-3 w-3 text-amber-500 flex-shrink-0" />
          )}
          <span className={cn(
            "text-[10px] truncate",
            isAI ? "text-purple-500" : hasAssignment ? "text-success" : "text-amber-500"
          )}>
            {handlerName}
          </span>
        </div>
      </div>
    </div>
  );
}
