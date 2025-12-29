import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Bot, Phone, Tag, User } from "lucide-react";

export interface ConversationSidebarCardConversation {
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  time: string;
  unread: number;
  handler: "ai" | "human";
  tags: Array<{ name: string; color: string }>;
  assignedTo: string | null;
  whatsappPhone: string | null;
  whatsappInstance: string | null;
  avatarUrl: string | null;
  clientStatus: { name: string; color: string } | null;
  aiAgentName: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function maskPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "----";
  if (digits.length <= 4) return `•••${digits}`;
  return `•••${digits.slice(-4)}`;
}

/** Returns connection identifier: last 4 digits of phone_number, or instance_name abbreviation */
function getConnectionIdentifier(phone: string | null, instanceName: string | null): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length >= 4) {
    return `•••${digits.slice(-4)}`;
  }
  // Fallback to instance name (first 4 chars or full name if shorter)
  if (instanceName) {
    return instanceName.length > 6 ? instanceName.slice(0, 4) : instanceName;
  }
  return "----";
}

interface ConversationSidebarCardProps {
  conversation: ConversationSidebarCardConversation;
  selected?: boolean;
  onClick: () => void;
}

export function ConversationSidebarCard({ conversation, selected, onClick }: ConversationSidebarCardProps) {
  const isAI = conversation.handler === "ai";
  const handlerLabel = isAI
    ? `IA ${conversation.aiAgentName || ""}`.trim()
    : conversation.assignedTo?.split(" ")[0] || "Atendente";

  const connectionId = getConnectionIdentifier(conversation.whatsappPhone, conversation.whatsappInstance);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full text-left rounded-lg bg-card border border-border/50 p-3",
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
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 border-2 border-success/30">
          {conversation.avatarUrl ? (
            <AvatarImage src={conversation.avatarUrl} alt={`Avatar de ${conversation.name}`} />
          ) : null}
          <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">
            {getInitials(conversation.name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className={cn("font-semibold text-sm truncate", conversation.unread > 0 && "font-bold")}>
              {conversation.name}
            </h3>
            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-success" />
              <span className="tabular-nums">{conversation.time}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{conversation.phone || "Sem telefone"}</p>
        </div>
      </div>

      {/* Message preview */}
      <div className="mt-2">
        <p
          className={cn(
            "text-xs text-muted-foreground line-clamp-2",
            conversation.unread > 0 && "text-foreground font-medium"
          )}
        >
          {conversation.lastMessage}
        </p>
      </div>

      {/* Status + Tags */}
      {(conversation.clientStatus || conversation.tags.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {conversation.clientStatus && (
            <Badge
              className="text-xs h-5 px-2 border-0"
              style={{
                backgroundColor: `${conversation.clientStatus.color}20`,
                color: conversation.clientStatus.color,
              }}
            >
              {conversation.clientStatus.name}
            </Badge>
          )}

          {conversation.tags.slice(0, 2).map((tag, idx) => (
            <Badge
              key={`${tag.name}-${idx}`}
              className="text-xs h-5 px-2 border-0"
              style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-border/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Tag className="h-3 w-3" />
          <div className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            <span className="tabular-nums">{connectionId}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          {isAI ? (
            <Bot className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
          ) : (
            <User className="h-3.5 w-3.5 text-success flex-shrink-0" />
          )}
          <span
            className={cn(
              "text-xs truncate max-w-[140px]",
              isAI ? "text-purple-500" : "text-success"
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
