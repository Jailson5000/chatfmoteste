// Centralized types for Conversations module

import { PaginatedMessage } from "@/hooks/useMessagesWithPagination";
import { ActivityItem } from "@/components/conversations/InlineActivityBadge";

export type ConversationTab = "chat" | "ai" | "queue" | "all" | "archived";

export interface Message {
  id: string;
  content: string | null;
  created_at: string;
  is_from_me: boolean;
  sender_type: string;
  ai_generated: boolean;
  media_url?: string | null;
  media_mime_type?: string | null;
  message_type?: string;
  status?: "sending" | "sent" | "delivered" | "read" | "error";
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
  _clientOrder?: number;
  _clientTempId?: string;
}

export interface ConversationFilters {
  statuses: string[];
  handlers: Array<'ai' | 'human' | 'unassigned'>;
  tags: string[];
  departments: string[];
  searchName: string;
  searchPhone: string;
}

export interface MediaPreviewState {
  open: boolean;
  file: File | null;
  mediaType: "image" | "audio" | "video" | "document";
  previewUrl: string | null;
}

export interface ArchiveState {
  dialogOpen: boolean;
  reason: string;
  customReason: string;
  nextResponsible: string | null;
  nextResponsibleType: "human" | "ai" | null;
}

export interface InstanceChangeState {
  dialogOpen: boolean;
  pending: {
    conversationId: string;
    newInstanceId: string;
    oldInstanceName: string;
    newInstanceName: string;
    oldPhoneDigits?: string;
    newPhoneDigits?: string;
    existingConvName?: string;
  } | null;
}

export interface MappedConversation {
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  time: string;
  unread: number;
  handler: "ai" | "human" | "unassigned";
  status: string | null;
  archivedAt: string | null;
  archivedReason: string | null;
  archivedByName: string | null;
  tags: Array<{ name: string; color: string }>;
  assignedTo: string | null;
  assignedUserId: string | null;
  whatsappInstance: string | null;
  whatsappPhone: string | null;
  avatarUrl: string | null;
  clientStatus: { id: string; name: string; color: string } | null;
  department: { id: string; name: string; color: string } | null;
  aiAgentName: string;
  scheduledFollowUps: number;
  origin: string | null;
  originMetadata: any;
}

export type TimelineItem = 
  | { type: 'message'; data: PaginatedMessage }
  | { type: 'activity'; data: ActivityItem };

// Archive reason options
export const ARCHIVE_REASONS = [
  { value: "resolved", label: "Chat do cliente resolvido com sucesso." },
  { value: "no_response", label: "Cliente não responde mais." },
  { value: "opened_by_mistake", label: "Abri sem querer." },
  { value: "other", label: "Outros." },
] as const;

export type ArchiveReasonValue = typeof ARCHIVE_REASONS[number]["value"];
