import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Bot, UserCheck, Inbox, Phone } from "lucide-react";
import { UnreadBadge } from "./UnreadBadge";

interface ConversationListItemProps {
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  time: string;
  unread: number;
  handler: 'ai' | 'human';
  status?: string;
  tags: Array<{ name: string; color: string }>;
  assignedTo?: string | null;
  instancePhone?: string | null;
  isSelected: boolean;
  onClick: () => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function ConversationListItem({
  name,
  phone,
  lastMessage,
  time,
  unread,
  handler,
  status,
  tags,
  assignedTo,
  instancePhone,
  isSelected,
  onClick,
}: ConversationListItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "p-3 cursor-pointer transition-all duration-200 border-b border-border/50",
        "hover:bg-muted/50",
        isSelected && "bg-primary/5 border-l-2 border-l-primary"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="relative">
          <Avatar className="h-10 w-10">
            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${name}`} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          {/* Online indicator */}
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-background" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium truncate">{name}</span>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">{time}</span>
          </div>
          
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Phone className="h-2.5 w-2.5" />
            <span className="truncate">{phone}</span>
            {instancePhone && (
              <span className="text-[10px] text-muted-foreground/70">
                • {instancePhone.slice(-4)}
              </span>
            )}
          </div>
          
          <p className="text-xs text-muted-foreground truncate mt-1">{lastMessage}</p>
          
          {/* Bottom row: badges */}
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {/* Handler badge */}
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] h-5 px-1.5 gap-0.5",
                handler === "ai"
                  ? "border-purple-500/50 text-purple-600 bg-purple-50 dark:bg-purple-900/20"
                  : "border-green-500/50 text-green-600 bg-green-50 dark:bg-green-900/20"
              )}
            >
              {handler === "ai" ? <Bot className="h-2.5 w-2.5" /> : <UserCheck className="h-2.5 w-2.5" />}
              {handler === "ai" ? "IA" : (assignedTo?.split(" ")[0] || "Humano")}
            </Badge>
            
            {/* Status badge */}
            {status && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                {status.replace(/_/g, ' ')}
              </Badge>
            )}
            
            {/* Tags */}
            {tags.slice(0, 1).map((tag, i) => (
              <Badge 
                key={i}
                variant="outline" 
                className="text-[10px] h-5 px-1.5 truncate max-w-[60px]"
                style={{ 
                  borderColor: tag.color, 
                  backgroundColor: `${tag.color}20`,
                  color: tag.color 
                }}
              >
                {tag.name}
              </Badge>
            ))}
            {tags.length > 1 && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1">
                +{tags.length - 1}
              </Badge>
            )}
            
            {/* Unread badge */}
            {unread > 0 && <UnreadBadge count={unread} />}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConversationListProps {
  conversations: Array<{
    id: string;
    name: string;
    phone: string;
    lastMessage: string;
    time: string;
    unread: number;
    handler: 'ai' | 'human';
    status?: string;
    tags: Array<{ name: string; color: string }>;
    assignedTo?: string | null;
    whatsappInstance?: string | null;
    instancePhone?: string | null;
  }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyMessage?: string;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  emptyMessage = "Nenhuma conversa encontrada",
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-muted-foreground">
          <Inbox className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div>
        {conversations.map((conv) => (
          <ConversationListItem
            key={conv.id}
            id={conv.id}
            name={conv.name}
            phone={conv.phone}
            lastMessage={conv.lastMessage}
            time={conv.time}
            unread={conv.unread}
            handler={conv.handler}
            status={conv.status}
            tags={conv.tags}
            assignedTo={conv.assignedTo}
            instancePhone={conv.instancePhone}
            isSelected={selectedId === conv.id}
            onClick={() => onSelect(conv.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
