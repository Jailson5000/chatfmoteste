import { memo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Bot, Folder, Globe, Phone, Smartphone, Tag, User, UserX } from "lucide-react";

export interface ConversationSidebarCardConversation {
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  time: string;
  unread: number;
  handler: "ai" | "human" | "unassigned";
  tags: Array<{ name: string; color: string }>;
  assignedTo: string | null;
  whatsappPhone: string | null;
  whatsappInstance: string | null;
  avatarUrl: string | null;
  clientStatus: { name: string; color: string } | null;
  department: { name: string; color: string } | null;
  aiAgentName: string;
  scheduledFollowUps?: number;
  // New fields for channel differentiation
  origin?: string | null;
  originMetadata?: unknown;
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/** Formats Brazilian phone number: +55 11 99999-9999 */
function formatBrazilianPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "Sem telefone";
  
  // Full Brazilian format: 55 + DDD (2) + number (8-9)
  if (digits.length === 13) {
    // +55 11 99999-9999
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12) {
    // +55 11 9999-9999
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    // 11 99999-9999 (without country code)
    return `${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    // 11 9999-9999 (without country code, landline)
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  // Return as-is for other lengths
  return phone;
}

/** 
 * Returns connection/channel info based on conversation origin
 * For WhatsApp: shows last 4 digits of phone
 * For Widget/Tray/Site: shows "Site" label
 */
function getConnectionInfo(
  phone: string | null, 
  instanceName: string | null,
  origin?: string | null
): { label: string; isPhone: boolean; isWidget: boolean; tooltipText: string } {
  const upperOrigin = origin?.toUpperCase();
  
  // Non-WhatsApp origins (Widget, Tray, Site, Web)
  if (upperOrigin === 'WIDGET' || upperOrigin === 'TRAY' || upperOrigin === 'SITE' || upperOrigin === 'WEB') {
    return { 
      label: "Site", 
      isPhone: false, 
      isWidget: true,
      tooltipText: `Canal: ${upperOrigin === 'WIDGET' ? 'Chat do Site' : upperOrigin}`
    };
  }
  
  // WhatsApp origin (default)
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length >= 4) {
    return { 
      label: `•••${digits.slice(-4)}`, 
      isPhone: true, 
      isWidget: false,
      tooltipText: instanceName || "WhatsApp"
    };
  }
  // Fallback to instance name (first 6 chars or full name if shorter)
  if (instanceName) {
    return { 
      label: instanceName.length > 6 ? instanceName.slice(0, 6) : instanceName, 
      isPhone: false, 
      isWidget: false,
      tooltipText: instanceName
    };
  }
  return { label: "----", isPhone: false, isWidget: false, tooltipText: "Canal não identificado" };
}

interface ConversationSidebarCardProps {
  conversation: ConversationSidebarCardConversation;
  selected?: boolean;
  onClick: () => void;
}

function ConversationSidebarCardComponent({ conversation, selected, onClick }: ConversationSidebarCardProps) {
  const isAI = conversation.handler === "ai";
  const isUnassigned = conversation.handler === "unassigned";
  const hasAssigned = !!conversation.assignedTo;

  // Show "IA · AgentName" when available, otherwise just "IA"
  const agentName = conversation.aiAgentName && conversation.aiAgentName !== "IA"
    ? conversation.aiAgentName
    : null;

  let handlerLabel: string;
  if (isAI) {
    handlerLabel = agentName ? `IA · ${agentName}` : "IA";
  } else if (isUnassigned || !hasAssigned) {
    handlerLabel = "Sem responsável";
  } else {
    handlerLabel = conversation.assignedTo!;
  }

  const connectionInfo = getConnectionInfo(conversation.whatsappPhone, conversation.whatsappInstance, conversation.origin);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full text-left rounded-lg bg-card border border-border/50 p-2.5",
        "transition-all duration-200 hover:border-border hover:shadow-md",
        selected && "bg-muted ring-1 ring-primary/20"
      )}
    >
      {/* Unread badge */}
      {conversation.unread > 0 && (
        <div className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
          {conversation.unread > 99 ? "99+" : conversation.unread}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-2">
        <Avatar className="h-9 w-9 border-2 border-success/30 flex-shrink-0">
          {conversation.avatarUrl ? (
            <AvatarImage src={conversation.avatarUrl} alt={`Avatar de ${conversation.name}`} />
          ) : null}
          <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">
            {getInitials(conversation.name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <h3
              className={cn(
                "min-w-0 flex-1 font-semibold text-[11px] leading-4 truncate max-w-[120px]",
                conversation.unread > 0 && "font-bold"
              )}
              title={conversation.name}
            >
              {conversation.name}
            </h3>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
              <span className="tabular-nums">{conversation.time}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {formatBrazilianPhone(conversation.phone)}
          </p>
        </div>
      </div>

      {/* Message preview */}
      <div className="mt-2 min-w-0">
        <p
          className={cn(
            "text-xs text-muted-foreground line-clamp-2 [overflow-wrap:anywhere] [word-break:break-word]",
            conversation.unread > 0 && "text-foreground font-medium"
          )}
        >
          {conversation.lastMessage}
        </p>
      </div>

      {/* Status + Department + Tags */}
      {(conversation.clientStatus || conversation.department || conversation.tags.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1 min-w-0 overflow-hidden">
          {conversation.clientStatus && (
            <Badge
              className="text-[10px] h-[18px] px-1.5 border-0 min-w-0 max-w-[100px]"
              style={{
                backgroundColor: `${conversation.clientStatus.color}20`,
                color: conversation.clientStatus.color,
              }}
            >
              <span className="truncate">{conversation.clientStatus.name}</span>
            </Badge>
          )}

          {conversation.department && (
            <Badge
              className="text-[10px] h-[18px] px-1.5 border-0 gap-0.5 min-w-0 max-w-[100px]"
              style={{
                backgroundColor: `${conversation.department.color}20`,
                color: conversation.department.color,
              }}
            >
              <Folder className="h-2.5 w-2.5 flex-shrink-0" />
              <span className="truncate">{conversation.department.name}</span>
            </Badge>
          )}

          {conversation.tags.slice(0, 1).map((tag, idx) => (
            <Badge
              key={`${tag.name}-${idx}`}
              className="text-[10px] h-[18px] px-1.5 border-0 min-w-0 max-w-[80px]"
              style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
            >
              <span className="truncate">{tag.name}</span>
            </Badge>
          ))}
          {conversation.tags.length > 1 && (
            <Badge variant="secondary" className="text-[10px] h-[18px] px-1">
              +{conversation.tags.length - 1}
            </Badge>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 pt-1.5 border-t border-border/50 flex items-center gap-2">
        {/* Left: Tags + Instance (compact) */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
          {/* Tags icon with tooltip */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center cursor-pointer hover:text-foreground transition-colors">
                  <Tag className="h-3 w-3" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {conversation.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1 p-1">
                    {conversation.tags.map((tag, idx) => (
                      <Badge
                        key={`tooltip-${tag.name}-${idx}`}
                        className="text-xs h-5 px-2 border-0"
                        style={{ backgroundColor: `${tag.color}40`, color: tag.color }}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Sem etiquetas</span>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Connection icon with identifier */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors",
                  connectionInfo.isWidget && "text-blue-500"
                )}>
                  {connectionInfo.isWidget ? (
                    <Globe className="h-3 w-3" />
                  ) : connectionInfo.isPhone ? (
                    <Phone className="h-3 w-3" />
                  ) : (
                    <Smartphone className="h-3 w-3" />
                  )}
                  <span className="tabular-nums">{connectionInfo.label}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span className="text-xs">
                  {connectionInfo.tooltipText}
                </span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Handler (takes remaining space, aligns right) */}
        <div className="flex items-center gap-1 ml-auto min-w-0">
          {isAI ? (
            <Bot className="h-3 w-3 text-purple-500 flex-shrink-0" />
          ) : isUnassigned || !hasAssigned ? (
            <UserX className="h-3 w-3 text-amber-500 flex-shrink-0" />
          ) : (
            <User className="h-3 w-3 text-success flex-shrink-0" />
          )}
          <span
            className={cn(
              "text-[10px] truncate",
              isAI ? "text-purple-500" : (isUnassigned || !hasAssigned) ? "text-amber-500" : "text-success"
            )}
            title={handlerLabel}
          >
            {handlerLabel}
          </span>
        </div>
      </div>
    </button>
  );
}

// Memoize to prevent re-renders when parent state changes (e.g., input typing)
export const ConversationSidebarCard = memo(ConversationSidebarCardComponent);
