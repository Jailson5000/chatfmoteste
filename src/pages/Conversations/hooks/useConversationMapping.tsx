import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MappedConversation } from "../types";

interface UseConversationMappingProps {
  conversations: any[];
  automations: Array<{ id: string; name: string; is_active?: boolean }>;
  followUpsByConversation: Record<string, number>;
}

export function useConversationMapping({
  conversations,
  automations,
  followUpsByConversation,
}: UseConversationMappingProps): MappedConversation[] {
  return useMemo(() => {
    const getLastMessagePreview = (lastMessage: any): string => {
      if (!lastMessage) return "Sem mensagens";
      const { content, message_type, is_from_me } = lastMessage;
      
      // Handle different message types
      if (message_type) {
        const typeUpper = message_type.toUpperCase();
        // Extract caption from content if it's a media message with text
        const caption = content && !["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"].includes(content.toUpperCase()) 
          ? content 
          : null;
          
        switch (typeUpper) {
          case "IMAGE":
            return caption ? `📷 ${caption}` : (is_from_me ? "📷 Imagem enviada" : "📷 Imagem");
          case "VIDEO":
            return caption ? `🎬 ${caption}` : (is_from_me ? "🎬 Vídeo enviado" : "🎬 Vídeo");
          case "AUDIO":
            return caption ? `🎤 ${caption}` : (is_from_me ? "🎤 Áudio enviado" : "🎤 Áudio");
          case "DOCUMENT":
            return caption ? `📄 ${caption}` : (is_from_me ? "📄 Documento enviado" : "📄 Documento");
        }
      }
      
      return content?.trim() || "Sem mensagens";
    };

    const formatTimeAgoShort = (date: string | null) => {
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
    };

    // Build a map of automation IDs to names for fast lookup
    const automationMap = automations.reduce((acc, a) => {
      acc[a.id] = a.name;
      return acc;
    }, {} as Record<string, string>);

    return conversations.map((conv) => {
      const hasActiveAutomation = !!conv.current_automation_id;
      const hasHumanAssigned = !!conv.assigned_to;

      // Determine effective handler type
      let effectiveHandler: "ai" | "human" | "unassigned";
      if (conv.current_handler === "ai" && hasActiveAutomation) {
        effectiveHandler = "ai";
      } else if (!hasActiveAutomation && !hasHumanAssigned) {
        effectiveHandler = "unassigned";
      } else {
        effectiveHandler = "human";
      }

      // Prefer the joined automation name from the conversation
      const joinedAutomationName = (conv as any).current_automation?.name as string | undefined;
      const aiAgentName = joinedAutomationName?.trim()
        ? joinedAutomationName
        : conv.current_automation_id
          ? automationMap[conv.current_automation_id] || "IA"
          : "IA";

      return {
        id: conv.id,
        name: conv.contact_name || conv.contact_phone || "Sem nome",
        phone: conv.contact_phone || "",
        lastMessage: getLastMessagePreview(conv.last_message),
        time: formatTimeAgoShort(conv.last_message_at),
        unread: (conv as any).unread_count || 0,
        handler: effectiveHandler,
        status: conv.status,
        archivedAt: (conv as any).archived_at || null,
        tags: (conv as any).client_tags || [],
        assignedTo: conv.assigned_profile?.full_name || null,
        assignedUserId: (conv as any).assigned_to || null,
        whatsappInstance: conv.whatsapp_instance?.display_name || conv.whatsapp_instance?.instance_name || null,
        whatsappPhone: conv.whatsapp_instance?.phone_number || null,
        avatarUrl: conv.client?.avatar_url || null,
        clientStatus: conv.client?.custom_status || null,
        department: conv.department || null,
        aiAgentName,
        scheduledFollowUps: followUpsByConversation[conv.id] || 0,
        origin: conv.origin || null,
        originMetadata: conv.origin_metadata || null,
      };
    });
  }, [conversations, automations, followUpsByConversation]);
}
