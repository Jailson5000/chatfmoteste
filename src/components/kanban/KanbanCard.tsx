import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Bot, User, Phone, CheckCheck, Image, Mic, Video, FileText, Smartphone, Tag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface KanbanCardProps {
  conversation: {
    id: string;
    contact_name: string | null;
    contact_phone: string | null;
    status: string;
    current_handler: 'ai' | 'human';
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
    client?: { custom_status_id?: string | null } | null;
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
  
  // Get handler name: if AI, show "IA + automation name", if human, show person's name
  const activeAutomation = automations.find(a => a.is_active);
  const handlerName = conversation.current_handler === 'ai' 
    ? `IA ${activeAutomation?.name || ''}`.trim()
    : (conversation.assigned_profile?.full_name?.split(' ')[0] || 'Sem responsável');
  
  const isAI = conversation.current_handler === 'ai';

  // Instance identifier: last 4 digits of phone OR display_name/instance_name as fallback
  const getInstanceInfo = () => {
    const phone = conversation.whatsapp_instance?.phone_number;
    const digits = (phone || "").replace(/\D/g, "");
    if (digits.length >= 4) {
      return { label: `•••${digits.slice(-4)}`, isPhone: true };
    }
    // Fallback to display_name or instance_name
    const displayName = conversation.whatsapp_instance?.display_name || conversation.whatsapp_instance?.instance_name;
    if (displayName) {
      return { label: displayName.length > 8 ? displayName.slice(0, 8) : displayName, isPhone: false };
    }
    return { label: "----", isPhone: false };
  };
  const instanceInfo = getInstanceInfo();
  
  // Get matched tags
  const conversationTags = (conversation.tags || [])
    .map(tagName => allTags.find(t => t.name === tagName || t.id === tagName))
    .filter(Boolean);

  const messageType = conversation.last_message?.message_type;
  const messageIcon = getMessageIcon(messageType);
  const messageLabel = getMessageTypeLabel(messageType);
  const isFromMe = conversation.last_message?.is_from_me;
  
  // Get message preview
  let messagePreview = conversation.last_message?.content || "Sem mensagens";
  if (messageType && messageType !== "text" && !conversation.last_message?.content) {
    messagePreview = messageLabel;
  }

  const unreadCount = conversation.unread_count || 0;

  return (
    <div
      className={cn(
        "group relative rounded-lg bg-card border border-border/50 p-3 cursor-grab active:cursor-grabbing",
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
        <div className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
          {unreadCount > 99 ? "99+" : unreadCount}
        </div>
      )}

      {/* Header: Avatar, Name, Phone, Time */}
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 border-2 border-success/30">
          <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${conversation.contact_name || conversation.contact_phone}`} />
          <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">
            {getInitials(conversation.contact_name)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold text-sm truncate">
              {conversation.contact_name || conversation.contact_phone || "Sem nome"}
            </h4>
            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-success" />
              <span>{timeAgo}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{maskedPhone}</p>
        </div>
      </div>

      {/* Message Preview */}
      <div className="mt-2 flex items-start gap-1.5">
        {isFromMe && (
          <CheckCheck className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
        )}
        {messageIcon && (
          <span className="text-muted-foreground flex-shrink-0 mt-0.5">{messageIcon}</span>
        )}
        <p className="text-xs text-muted-foreground line-clamp-2">
          {messagePreview}
        </p>
      </div>

      {/* Status Badge */}
      {customStatus && (
        <div className="mt-2">
          <Badge 
            className="text-xs h-5 px-2 border-0"
            style={{ 
              backgroundColor: `${customStatus.color}20`,
              color: customStatus.color 
            }}
          >
            {customStatus.name}
          </Badge>
        </div>
      )}

      {/* Footer: Tags, Instance, Handler */}
      <div className="mt-3 pt-2 border-t border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {/* Tags icon with tooltip */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center cursor-pointer hover:text-foreground transition-colors">
                  <Tag className="h-3 w-3" />
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

          {/* Instance identifier */}
          <div className="flex items-center gap-1">
            {instanceInfo.isPhone ? (
              <Phone className="h-3 w-3" />
            ) : (
              <Smartphone className="h-3 w-3" />
            )}
            <span>{instanceInfo.label}</span>
          </div>
        </div>

        {/* Handler */}
        <div className="flex items-center gap-1.5">
          {isAI ? (
            <Bot className="h-3.5 w-3.5 text-purple-500" />
          ) : (
            <User className="h-3.5 w-3.5 text-success" />
          )}
          <span className={cn(
            "text-xs truncate max-w-[100px]",
            isAI ? "text-purple-500" : "text-success"
          )}>
            {handlerName}
          </span>
        </div>
      </div>
    </div>
  );
}
