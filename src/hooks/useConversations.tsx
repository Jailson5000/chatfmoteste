import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tables } from "@/integrations/supabase/types";
import { useEffect } from "react";

type Conversation = Tables<"conversations">;

interface ConversationWithLastMessage extends Conversation {
  last_message?: {
    content: string | null;
    created_at: string;
    message_type?: string;
    is_from_me?: boolean;
  } | null;
  whatsapp_instance?: {
    instance_name: string;
    display_name?: string | null;
    phone_number?: string | null;
  } | null;
  assigned_profile?: {
    full_name: string;
  } | null;
  unread_count?: number;
  client?: {
    id?: string;
    custom_status_id?: string | null;
    avatar_url?: string | null;
    custom_status?: {
      id: string;
      name: string;
      color: string;
    } | null;
  } | null;
  department?: {
    id: string;
    name: string;
    color: string;
  } | null;
  client_tags?: Array<{
    name: string;
    color: string;
  }>;
}

export function useConversations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading, error } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      // Fetch conversations with related data including phone_number
      const { data: convs, error: convError } = await supabase
        .from("conversations")
        .select(`
          *,
          whatsapp_instance:whatsapp_instances(instance_name, display_name, phone_number),
          client:clients(id, custom_status_id, avatar_url, custom_status:custom_statuses(id, name, color)),
          department:departments(id, name, color)
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

      // Fetch client IDs to get their tags
      const clientIds = (convs || [])
        .map(c => (c.client as { id?: string } | null)?.id)
        .filter((id): id is string => id !== null && id !== undefined);

      // Fetch client tags from client_tags table
      let clientTagsMap: Record<string, Array<{ name: string; color: string }>> = {};
      if (clientIds.length > 0) {
        const { data: clientTagsData } = await supabase
          .from("client_tags")
          .select("client_id, tag:tags(name, color)")
          .in("client_id", clientIds);
        
        if (clientTagsData) {
          clientTagsMap = clientTagsData.reduce((acc, ct) => {
            const clientId = ct.client_id;
            const tag = ct.tag as { name: string; color: string } | null;
            if (tag) {
              if (!acc[clientId]) acc[clientId] = [];
              acc[clientId].push({ name: tag.name, color: tag.color });
            }
            return acc;
          }, {} as Record<string, Array<{ name: string; color: string }>>);
        }
      }

      // Fetch last message and unread count for each conversation
      const conversationsWithMessages: ConversationWithLastMessage[] = await Promise.all(
        (convs || []).map(async (conv) => {
          const [lastMsgResult, unreadResult] = await Promise.all([
            supabase
              .from("messages")
              .select("content, created_at, message_type, is_from_me")
              .eq("conversation_id", conv.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("conversation_id", conv.id)
              .eq("is_from_me", false)
              .is("read_at", null)
          ]);

          const clientData = conv.client as { id?: string; custom_status_id?: string | null; avatar_url?: string | null; custom_status?: { id: string; name: string; color: string } | null } | null;
          const clientId = clientData?.id;

          return {
            ...conv,
            last_message: lastMsgResult.data,
            whatsapp_instance: conv.whatsapp_instance as { instance_name: string; display_name?: string | null; phone_number?: string | null } | null,
            assigned_profile: conv.assigned_to ? { full_name: profilesMap[conv.assigned_to] || "Desconhecido" } : null,
            unread_count: unreadResult.count || 0,
            client: clientData,
            client_tags: clientId ? clientTagsMap[clientId] || [] : [],
          };
        })
      );

      return conversationsWithMessages;
    },
  });

  // Real-time subscription for conversations, messages, clients, and custom_statuses
  useEffect(() => {
    const conversationsChannel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    // Listen for new messages to update last_message
    const messagesChannel = supabase
      .channel('messages-for-conversations')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    // Listen for client updates (status changes, avatar, etc.)
    const clientsChannel = supabase
      .channel('clients-for-conversations')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'clients'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    // Listen for custom_statuses updates (name/color changes)
    const statusesChannel = supabase
      .channel('statuses-for-conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'custom_statuses'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    // Listen for departments updates (name/color changes)
    const departmentsChannel = supabase
      .channel('departments-for-conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'departments'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(clientsChannel);
      supabase.removeChannel(statusesChannel);
      supabase.removeChannel(departmentsChannel);
    };
  }, [queryClient]);

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
    },
    onError: (error) => {
      toast({
        title: "Erro ao transferir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateConversationDepartment = useMutation({
    mutationFn: async ({ conversationId, departmentId }: { conversationId: string; departmentId: string | null }) => {
      const { error } = await supabase
        .from("conversations")
        .update({ department_id: departmentId })
        .eq("id", conversationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao mover conversa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateConversationTags = useMutation({
    mutationFn: async ({ conversationId, tags }: { conversationId: string; tags: string[] }) => {
      const { error } = await supabase
        .from("conversations")
        .update({ tags })
        .eq("id", conversationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar etiquetas",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateClientStatus = useMutation({
    mutationFn: async ({ clientId, statusId }: { clientId: string; statusId: string | null }) => {
      const { error } = await supabase
        .from("clients")
        .update({ custom_status_id: statusId })
        .eq("id", clientId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar status",
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
    updateConversationDepartment,
    updateConversationTags,
    updateClientStatus,
    transferHandler,
  };
}
