import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tables } from "@/integrations/supabase/types";

type Conversation = Tables<"conversations">;

interface ConversationWithLastMessage extends Conversation {
  last_message?: {
    content: string | null;
    created_at: string;
  } | null;
  whatsapp_instance?: {
    instance_name: string;
  } | null;
  assigned_profile?: {
    full_name: string;
  } | null;
}

export function useConversations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading, error } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      // Fetch conversations with related data
      const { data: convs, error: convError } = await supabase
        .from("conversations")
        .select(`
          *,
          whatsapp_instance:whatsapp_instances(instance_name)
        `)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (convError) throw convError;

      // Fetch assigned profiles separately
      const assignedIds = (convs || [])
        .map(c => c.assigned_to)
        .filter((id): id is string => id !== null);
      
      let profilesMap: Record<string, string> = {};
      if (assignedIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", assignedIds);
        
        profilesMap = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p.full_name;
          return acc;
        }, {} as Record<string, string>);
      }

      // Fetch last message for each conversation
      const conversationsWithMessages: ConversationWithLastMessage[] = await Promise.all(
        (convs || []).map(async (conv) => {
          const { data: lastMsg } = await supabase
            .from("messages")
            .select("content, created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...conv,
            last_message: lastMsg,
            whatsapp_instance: conv.whatsapp_instance as { instance_name: string } | null,
            assigned_profile: conv.assigned_to ? { full_name: profilesMap[conv.assigned_to] || "Desconhecido" } : null,
          };
        })
      );

      return conversationsWithMessages;
    },
  });

  const updateConversation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Conversation> & { id: string }) => {
      const { error } = await supabase
        .from("conversations")
        .update(updates)
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar conversa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateConversationStatus = useMutation({
    mutationFn: async ({ conversationId, status }: { conversationId: string; status: string }) => {
      const { error } = await supabase
        .from("conversations")
        .update({ status: status as any })
        .eq("id", conversationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({
        title: "Status atualizado",
        description: "O status da conversa foi atualizado com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const transferHandler = useMutation({
    mutationFn: async ({ 
      conversationId, 
      handlerType, 
      assignedTo 
    }: { 
      conversationId: string; 
      handlerType: 'ai' | 'human';
      assignedTo?: string | null;
    }) => {
      const { error } = await supabase
        .from("conversations")
        .update({ 
          current_handler: handlerType,
          assigned_to: assignedTo || null 
        })
        .eq("id", conversationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({
        title: "Transferência realizada",
        description: "A conversa foi transferida com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao transferir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    conversations,
    isLoading,
    error,
    updateConversation,
    updateConversationStatus,
    transferHandler,
  };
}
