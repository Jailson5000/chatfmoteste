import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./KanbanCard";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";

interface Conversation {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  status: string;
  current_handler: 'ai' | 'human';
  current_automation_id?: string | null;
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
  client?: { custom_status_id?: string | null; avatar_url?: string | null } | null;
  unread_count?: number;
}

interface KanbanColumnProps {
  id: string | null;
  name: string;
  color: string;
  conversations: Conversation[];
  customStatuses: Array<{ id: string; name: string; color: string; is_active?: boolean }>;
  tags: Array<{ id: string; name: string; color: string }>;
  automations: Array<{ id: string; name: string; is_active: boolean }>;
  isDragging: boolean;
  isDraggable?: boolean;
  draggedConversation: string | null;
  groupByStatus?: boolean;
  isArchiveColumn?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDrop: () => void;
  onColumnDrop?: () => void;
  onConversationDragStart: (id: string) => void;
  onConversationClick: (conversation: Conversation) => void;
}

export function KanbanColumn({
  id,
  name,
  color,
  conversations,
  customStatuses,
  tags,
  automations,
  isDragging,
  isDraggable = false,
  draggedConversation,
  groupByStatus = false,
  isArchiveColumn = false,
  onDragStart,
  onDragEnd,
  onDrop,
  onColumnDrop,
  onConversationDragStart,
  onConversationClick,
}: KanbanColumnProps) {
  // Infinite scroll for cards in this column (20 initial, +15 on scroll)
  const cardScroll = useInfiniteScroll(conversations, {
    initialBatchSize: 20,
    batchIncrement: 15,
    threshold: 100,
  });

  const getCustomStatus = (conversation: Conversation) => {
    const statusId = conversation.client?.custom_status_id;
    if (!statusId) return null;
    return customStatuses.find(s => s.id === statusId) || null;
  };

  return (
    <div
      className={cn(
        "w-72 md:w-80 flex-shrink-0 transition-all",
        isDragging && "opacity-50 scale-95"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (draggedConversation) {
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        if (draggedConversation) {
          e.currentTarget.classList.add("ring-2", "ring-primary/50");
        }
      }}
      onDragLeave={(e) => {
        e.currentTarget.classList.remove("ring-2", "ring-primary/50");
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("ring-2", "ring-primary/50");
        if (draggedConversation) {
          onDrop();
        }
      }}
    >
      <div 
        className="rounded-xl border"
        style={{ 
          backgroundColor: `${color}08`,
          borderColor: `${color}30`
        }}
      >
        {/* Column Header */}
        <div 
          className={cn(
            "flex items-center justify-between p-3 border-b sticky top-0 backdrop-blur-sm z-10 rounded-t-xl",
            isDraggable && "cursor-grab active:cursor-grabbing"
          )}
          style={{ 
            borderColor: `${color}30`,
            backgroundColor: `${color}10`
          }}
          draggable={isDraggable}
          onDragStart={(e) => {
            if (isDraggable && onDragStart) {
              e.dataTransfer.setData("department", id || "");
              e.dataTransfer.effectAllowed = "move";
              onDragStart();
            }
          }}
          onDragEnd={() => {
            if (onDragEnd) onDragEnd();
          }}
          onDragOver={(e) => {
            if (isDraggable && onColumnDrop) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onDrop={(e) => {
            if (isDraggable && onColumnDrop) {
              e.preventDefault();
              e.stopPropagation();
              onColumnDrop();
            }
          }}
        >
          <div className="flex items-center gap-2">
            {isDraggable && (
              <GripVertical className="h-4 w-4 text-muted-foreground/50" />
            )}
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <h3 className="font-semibold text-sm">{name}</h3>
            <Badge 
              variant="secondary" 
              className="text-xs h-5 px-2 ml-1 rounded-full"
              style={{ 
                backgroundColor: `${color}20`,
                color: color,
                borderColor: color
              }}
            >
              {conversations.length}
            </Badge>
          </div>
        </div>

        {/* Cards */}
        <div 
          className="p-2 space-y-2 max-h-[calc(100vh-140px)] overflow-y-auto"
          onScroll={cardScroll.handleScroll}
        >
          {cardScroll.visibleData.map((conv) => (
            <KanbanCard
              key={conv.id}
              conversation={conv}
              customStatus={getCustomStatus(conv)}
              tags={tags}
              automations={automations}
              isDragging={draggedConversation === conv.id}
              onDragStart={() => onConversationDragStart(conv.id)}
              onClick={() => onConversationClick(conv)}
            />
          ))}
          {/* Load more indicator */}
          {cardScroll.hasMore && (
            <div className="py-2 text-center">
              <p className="text-[10px] text-muted-foreground">
                +{cardScroll.totalCount - cardScroll.displayedCount} cards
              </p>
            </div>
          )}
          {conversations.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs">
              Arraste conversas para cá
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
