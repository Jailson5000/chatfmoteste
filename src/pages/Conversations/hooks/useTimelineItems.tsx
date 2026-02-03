import { useMemo } from "react";
import { TimelineItem } from "../types";
import { PaginatedMessage } from "@/hooks/useMessagesWithPagination";
import { ActivityItem } from "@/components/conversations/InlineActivityBadge";

interface UseTimelineItemsProps {
  messages: PaginatedMessage[];
  inlineActivities: ActivityItem[];
}

export function useTimelineItems({ messages, inlineActivities }: UseTimelineItemsProps): TimelineItem[] {
  return useMemo(() => {
    const items: TimelineItem[] = [];
    
    // FIX: Deduplicate messages by whatsapp_message_id BEFORE adding to timeline
    // This prevents duplicate messages from appearing in the UI even if they somehow
    // made it past the backend deduplication (race conditions, etc.)
    const seenWhatsAppIds = new Set<string>();
    const deduplicatedMessages: PaginatedMessage[] = [];
    
    for (const msg of messages) {
      const whatsappId = msg.whatsapp_message_id;
      if (whatsappId) {
        if (seenWhatsAppIds.has(whatsappId)) {
          // Skip duplicate - keep the first occurrence (usually the one with correct metadata)
          continue;
        }
        seenWhatsAppIds.add(whatsappId);
      }
      deduplicatedMessages.push(msg);
    }
    
    // Add deduplicated messages
    deduplicatedMessages.forEach(msg => {
      items.push({ type: 'message', data: msg });
    });
    
    // Add activities
    inlineActivities.forEach(activity => {
      items.push({ type: 'activity', data: activity });
    });
    
    // Sort with stable, deterministic order
    // Rule: sort by timestamp; only use _clientOrder when timestamps are EXACTLY equal
    return items.sort((a, b) => {
      const aTime = a.type === 'message'
        ? new Date(a.data.created_at).getTime()
        : a.data.timestamp.getTime();
      const bTime = b.type === 'message'
        ? new Date(b.data.created_at).getTime()
        : b.data.timestamp.getTime();

      const diff = aTime - bTime;
      if (diff !== 0) return diff;

      const aClientOrder = a.type === 'message' ? (a.data as PaginatedMessage)._clientOrder : undefined;
      const bClientOrder = b.type === 'message' ? (b.data as PaginatedMessage)._clientOrder : undefined;

      if (aClientOrder !== undefined && bClientOrder !== undefined) {
        return aClientOrder - bClientOrder;
      }

      const aKey = a.type === 'message'
        ? ((a.data as PaginatedMessage)._clientTempId || a.data.id)
        : `activity_${(a.data as any).id}`;
      const bKey = b.type === 'message'
        ? ((b.data as PaginatedMessage)._clientTempId || b.data.id)
        : `activity_${(b.data as any).id}`;

      return String(aKey).localeCompare(String(bKey));
    });
  }, [messages, inlineActivities]);
}
