import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tables } from "@/integrations/supabase/types";
import { useLawFirm } from "@/hooks/useLawFirm";
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
  current_automation?: {
    id: string;
    name: string;
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
  const { lawFirm } = useLawFirm();

  const { data: conversations = [], isLoading, error } = useQuery({
    queryKey: ["conversations", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      // Fetch conversations with related data including phone_number + current automation name
      // Use explicit hint for automations relationship since FK was added
      const { data: convs, error: convError } = await supabase
        .from("conversations")
        .select(`
          *,
          whatsapp_instance:whatsapp_instances(instance_name, display_name, phone_number),
          current_automation:automations!fk_conversations_current_automation(id, name),
          client:clients(id, custom_status_id, avatar_url, custom_status:custom_statuses(id, name, color)),
          department:departments(id, name, color)
        `)
        .eq("law_firm_id", lawFirm.id)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (convError) throw convError;

      // Fetch assigned profiles separately
      const assignedIds = (convs || [])
        .map((c) => c.assigned_to)
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
        .map((c) => (c.client as { id?: string } | null)?.id)
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
              .is("read_at", null),
          ]);

          const clientData = conv.client as
            | {
                id?: string;
                custom_status_id?: string | null;
                avatar_url?: string | null;
                custom_status?: { id: string; name: string; color: string } | null;
              }
            | null;
          const clientId = clientData?.id;

          return {
            ...conv,
            last_message: lastMsgResult.data,
            whatsapp_instance: conv.whatsapp_instance as
              | { instance_name: string; display_name?: string | null; phone_number?: string | null }
              | null,
            current_automation: conv.current_automation as { id: string; name: string } | null,
            assigned_profile: conv.assigned_to
              ? { full_name: profilesMap[conv.assigned_to] || "Desconhecido" }
              : null,
            unread_count: unreadResult.count || 0,
            client: clientData,
            client_tags: clientId ? clientTagsMap[clientId] || [] : [],
          };
        })
      );

      return conversationsWithMessages;
    },
    enabled: !!lawFirm?.id,
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
      if (!lawFirm?.id) throw new Error("Escritório não encontrado");
      
      // SECURITY: Validate conversation belongs to user's law firm
      const { error } = await supabase
        .from("conversations")
        .update(updates)
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id); // Tenant isolation
      
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
      if (!lawFirm?.id) throw new Error("Escritório não encontrado");
      
      // SECURITY: Validate conversation belongs to user's law firm
      const { error } = await supabase
        .from("conversations")
        .update({ status: status as any })
        .eq("id", conversationId)
        .eq("law_firm_id", lawFirm.id); // Tenant isolation
      
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
      assignedTo,
      automationId,
      reason 
    }: { 
      conversationId: string; 
      handlerType: 'ai' | 'human';
      assignedTo?: string | null;
      automationId?: string | null; // ID do agente de IA específico
      reason?: string; // Motivo opcional da transferência
    }) => {
      // ========================================================================
      // CRITICAL: AI Transfer Logic - Prompt is determined by the ASSIGNED AI
      // ========================================================================
      // When transferring to a new AI, we update current_automation_id
      // The next message will use the NEW AI's prompt, NOT the old one
      // ========================================================================
      
      // First, get the current state of the conversation to log the transfer
      const { data: currentConversation, error: fetchError } = await supabase
        .from("conversations")
        .select("current_automation_id, law_firm_id")
        .eq("id", conversationId)
        .single();
      
      if (fetchError) throw fetchError;

      const fromAutomationId = currentConversation?.current_automation_id;
      const lawFirmId = currentConversation?.law_firm_id;

      const updateData: Record<string, any> = { 
        current_handler: handlerType,
        assigned_to: assignedTo || null 
      };
      
      // Se transferindo para IA, definir qual IA específica
      // Se transferindo para humano, limpar a IA atribuída
      let toAutomationId: string | null = null;
      if (handlerType === 'ai' && automationId) {
        updateData.current_automation_id = automationId;
        toAutomationId = automationId;
      } else if (handlerType === 'human') {
        updateData.current_automation_id = null;
      }
      
      if (!lawFirmId) {
        throw new Error("Empresa da conversa não encontrada");
      }

      const { data: updatedConversation, error } = await supabase
        .from("conversations")
        .update(updateData)
        .eq("id", conversationId)
        .eq("law_firm_id", lawFirmId)
        .select("id, current_handler, assigned_to, current_automation_id, law_firm_id")
        .maybeSingle();

      if (error) throw error;
      if (!updatedConversation) {
        throw new Error("Sem permissão para transferir esta conversa.");
      }

      // ========================================================================
      // AUDIT: Log the AI transfer for full traceability
      // ========================================================================
      if (toAutomationId && lawFirmId && toAutomationId !== fromAutomationId) {
        // Get agent names for the log
        const agentIds = [toAutomationId, fromAutomationId].filter(Boolean) as string[];
        const { data: agents } = await supabase
          .from("automations")
          .select("id, name")
          .in("id", agentIds);

        const agentsMap = (agents || []).reduce((acc, a) => {
          acc[a.id] = a.name;
          return acc;
        }, {} as Record<string, string>);

        // Get current user for audit
        const { data: { user } } = await supabase.auth.getUser();
        let userName: string | null = null;
        if (user?.id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .single();
          userName = profile?.full_name || null;
        }

        // Insert transfer log
        await supabase.from("ai_transfer_logs").insert({
          law_firm_id: lawFirmId,
          conversation_id: conversationId,
          from_agent_id: fromAutomationId,
          to_agent_id: toAutomationId,
          from_agent_name: fromAutomationId ? agentsMap[fromAutomationId] || null : null,
          to_agent_name: agentsMap[toAutomationId] || "Unknown",
          transferred_by: user?.id || null,
          transferred_by_name: userName,
          transfer_type: 'manual',
          reason: reason || null,
          metadata: {
            handler_type: handlerType,
            assigned_to: assignedTo,
            timestamp: new Date().toISOString(),
          },
        });
      }
    },
    onSuccess: async (_data, variables) => {
      // Force immediate refetch to update UI with new automation name
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      await queryClient.refetchQueries({ queryKey: ["conversations"] });
      
      toast({
        title: "Transferência realizada",
        description:
          variables.handlerType === "ai"
            ? "A conversa foi transferida para a IA selecionada."
            : "A conversa foi transferida para o atendente selecionado.",
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
      if (!lawFirm?.id) throw new Error("Escritório não encontrado");
      
      // SECURITY: Validate conversation belongs to user's law firm
      const { error } = await supabase
        .from("conversations")
        .update({ tags })
        .eq("id", conversationId)
        .eq("law_firm_id", lawFirm.id); // Tenant isolation
      
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
      if (!lawFirm?.id) throw new Error("Escritório não encontrado");
      
      if (statusId) {
        const { data, error } = await supabase.rpc("update_client_status_with_follow_ups", {
          _client_id: clientId,
          _new_status_id: statusId,
        });
        if (error) throw error;
        return data as any;
      }

      // Clearing status: update + cancel pending follow-ups
      // SECURITY: Validate client belongs to user's law firm
      const { error: updateError } = await supabase
        .from("clients")
        .update({ custom_status_id: null })
        .eq("id", clientId)
        .eq("law_firm_id", lawFirm.id); // Tenant isolation

      if (updateError) throw updateError;

      const { error: cancelError } = await supabase
        .from("scheduled_follow_ups")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancel_reason: "Status cleared",
        })
        .eq("client_id", clientId)
        .eq("status", "pending")
        .eq("law_firm_id", lawFirm.id); // Tenant isolation

      if (cancelError) throw cancelError;

      return { success: true, cleared: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["all-scheduled-follow-ups"] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update audio mode state for a conversation (SINGLE SOURCE OF TRUTH)
  const updateConversationAudioMode = useMutation({
    mutationFn: async ({ 
      conversationId, 
      enabled, 
      reason = 'manual_toggle' 
    }: { 
      conversationId: string; 
      enabled: boolean;
      reason?: 'user_request' | 'text_message_received' | 'manual_toggle' | 'accessibility_need';
    }) => {
      if (!lawFirm?.id) throw new Error("Escritório não encontrado");
      
      const now = new Date().toISOString();
      const updateData: Record<string, any> = {
        ai_audio_enabled: enabled,
        ai_audio_enabled_by: reason,
      };
      
      if (enabled) {
        updateData.ai_audio_last_enabled_at = now;
      } else {
        updateData.ai_audio_last_disabled_at = now;
      }

      // SECURITY: Validate conversation belongs to user's law firm
      const { error } = await supabase
        .from("conversations")
        .update(updateData)
        .eq("id", conversationId)
        .eq("law_firm_id", lawFirm.id); // Tenant isolation
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({
        title: variables.enabled ? "Áudio ativado" : "Áudio desativado",
        description: variables.enabled 
          ? "A IA responderá por áudio nesta conversa." 
          : "A IA voltará a responder por texto nesta conversa.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao alterar modo de áudio",
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
    updateConversationAudioMode,
    transferHandler,
  };
}
