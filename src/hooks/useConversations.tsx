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

      // Use optimized RPC that fetches everything in a single query
      // This eliminates the N+1 problem (2*N extra queries for last_message + unread_count)
      const { data, error: rpcError } = await supabase
        .rpc('get_conversations_with_metadata', { _law_firm_id: lawFirm.id });

      if (rpcError) {
        console.error('Error fetching conversations via RPC:', rpcError);
        throw rpcError;
      }

      // Map RPC response to match the expected ConversationWithLastMessage format
      // RPC returns JSONB objects with all fields already structured
      const conversationsWithMessages: ConversationWithLastMessage[] = (data || []).map((row: any) => ({
        // Base conversation fields - spread all from RPC response
        id: row.id,
        law_firm_id: row.law_firm_id,
        remote_jid: row.remote_jid,
        contact_name: row.contact_name,
        contact_phone: row.contact_phone,
        status: row.status,
        priority: row.priority,
        current_handler: row.current_handler,
        assigned_to: row.assigned_to,
        current_automation_id: row.current_automation_id,
        department_id: row.department_id,
        client_id: row.client_id,
        whatsapp_instance_id: row.whatsapp_instance_id,
        last_message_at: row.last_message_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        ai_summary: row.ai_summary,
        internal_notes: row.internal_notes,
        tags: row.tags,
        needs_human_handoff: row.needs_human_handoff,
        ai_audio_enabled: row.ai_audio_enabled,
        ai_audio_enabled_by: row.ai_audio_enabled_by,
        ai_audio_last_enabled_at: row.ai_audio_last_enabled_at,
        ai_audio_last_disabled_at: row.ai_audio_last_disabled_at,
        archived_at: row.archived_at,
        archived_reason: row.archived_reason,
        archived_next_responsible_id: row.archived_next_responsible_id,
        archived_next_responsible_type: row.archived_next_responsible_type,
        origin: row.origin,
        origin_metadata: row.origin_metadata,
        last_summarized_at: row.last_summarized_at,
        summary_message_count: row.summary_message_count,
        n8n_last_response_at: row.n8n_last_response_at,
        // Related data from nested JSONB
        whatsapp_instance: row.whatsapp_instance as { instance_name: string; display_name?: string | null; phone_number?: string | null } | null,
        current_automation: row.current_automation as { id: string; name: string } | null,
        department: row.department as { id: string; name: string; color: string } | null,
        client: row.client as {
          id?: string;
          custom_status_id?: string | null;
          avatar_url?: string | null;
          custom_status?: { id: string; name: string; color: string } | null;
        } | null,
        assigned_profile: row.assigned_profile as { full_name: string } | null,
        client_tags: (row.client_tags || []) as Array<{ name: string; color: string }>,
        last_message: row.last_message as {
          content: string | null;
          created_at: string;
          message_type?: string;
          is_from_me?: boolean;
        } | null,
        unread_count: Number(row.unread_count) || 0,
      }));

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
        .select("current_automation_id, law_firm_id, client_id")
        .eq("id", conversationId)
        .single();
      
      if (fetchError) throw fetchError;

      const fromAutomationId = currentConversation?.current_automation_id;
      const lawFirmId = currentConversation?.law_firm_id;
      const clientId = currentConversation?.client_id;

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
        .select("id, current_handler, assigned_to, current_automation_id, law_firm_id, client_id")
        .maybeSingle();

      if (error) throw error;
      if (!updatedConversation) {
        throw new Error("Sem permissão para transferir esta conversa.");
      }

      // ========================================================================
      // SYNC: Update client's assigned_to when transferring to human
      // ========================================================================
      if (assignedTo && clientId) {
        await supabase
          .from("clients")
          .update({ assigned_to: assignedTo })
          .eq("id", clientId)
          .eq("law_firm_id", lawFirmId);
      }

      // ========================================================================
      // AUDIT: Log ALL transfers (AI↔Human and AI↔AI) for full traceability
      // ========================================================================
      // Determine if this is a meaningful transfer that should be logged
      const isTransferToAI = handlerType === 'ai' && toAutomationId;
      const isTransferToHuman = handlerType === 'human' && assignedTo;
      const hasHandlerChange = isTransferToAI || isTransferToHuman;
      
      if (hasHandlerChange && lawFirmId) {
        // Get agent names for the log (if any AI involved)
        const agentIds = [toAutomationId, fromAutomationId].filter(Boolean) as string[];
        let agentsMap: Record<string, string> = {};
        
        if (agentIds.length > 0) {
          const { data: agents } = await supabase
            .from("automations")
            .select("id, name")
            .in("id", agentIds);
          agentsMap = (agents || []).reduce((acc, a) => {
            acc[a.id] = a.name;
            return acc;
          }, {} as Record<string, string>);
        }

        // Get current user for audit
        const { data: { user } } = await supabase.auth.getUser();
        let userName: string | null = null;
        let targetHumanName: string | null = null;
        
        if (user?.id || assignedTo) {
          const profileIds = [user?.id, assignedTo].filter(Boolean) as string[];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", profileIds);
          
          const profilesMap = (profiles || []).reduce((acc, p) => {
            acc[p.id] = p.full_name;
            return acc;
          }, {} as Record<string, string>);
          
          if (user?.id) userName = profilesMap[user.id] || null;
          if (assignedTo) targetHumanName = profilesMap[assignedTo] || null;
        }

        // Determine transfer type and target name
        const transferType = isTransferToHuman ? 'human' : 'ai';
        const toAgentId = isTransferToHuman ? assignedTo! : toAutomationId!;
        const toAgentName = isTransferToHuman 
          ? (targetHumanName || "Atendente")
          : (agentsMap[toAutomationId!] || "IA");

        // Insert transfer log
        await supabase.from("ai_transfer_logs").insert({
          law_firm_id: lawFirmId,
          conversation_id: conversationId,
          from_agent_id: fromAutomationId,
          to_agent_id: toAgentId,
          from_agent_name: fromAutomationId ? agentsMap[fromAutomationId] || null : null,
          to_agent_name: toAgentName,
          transferred_by: user?.id || null,
          transferred_by_name: userName,
          transfer_type: transferType,
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
      // Also invalidate clients to update assigned_to column
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      
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
    mutationFn: async ({ conversationId, departmentId, clientId }: { conversationId: string; departmentId: string | null; clientId?: string | null }) => {
      // Get current department name for logging
      const { data: conversation } = await supabase
        .from("conversations")
        .select("department_id, client_id, departments(name)")
        .eq("id", conversationId)
        .single();
      
      const fromDeptName = (conversation?.departments as any)?.name || null;
      const effectiveClientId = clientId || conversation?.client_id;
      
      // Get new department name
      let toDeptName: string | null = null;
      if (departmentId) {
        const { data: newDept } = await supabase
          .from("departments")
          .select("name")
          .eq("id", departmentId)
          .single();
        toDeptName = newDept?.name || null;
      }
      
      const { error } = await supabase
        .from("conversations")
        .update({ department_id: departmentId })
        .eq("id", conversationId);
      
      if (error) throw error;
      
      // Log department change if client exists and there's an actual change
      if (effectiveClientId && fromDeptName !== toDeptName) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: userProfile } = await supabase
          .from("profiles")
          .select("law_firm_id")
          .eq("id", user?.id || '')
          .single();
        
        if (userProfile?.law_firm_id) {
          await supabase.from("client_actions").insert({
            client_id: effectiveClientId,
            law_firm_id: userProfile.law_firm_id,
            action_type: "department_change",
            from_value: fromDeptName || "Sem departamento",
            to_value: toDeptName || "Sem departamento",
            description: `transferiu para departamento ${toDeptName || "Sem departamento"}`,
            performed_by: user?.id || null,
          });
        }
      }
    },
    // Optimistic update: update local cache immediately to avoid visual flicker
    onMutate: async ({ conversationId, departmentId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["conversations"] });

      // Snapshot current conversations
      const previousConversations = queryClient.getQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id]);

      // Optimistically update to the new department_id
      queryClient.setQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id], (old) => {
        if (!old) return old;
        return old.map((conv) =>
          conv.id === conversationId
            ? { ...conv, department_id: departmentId }
            : conv
        );
      });

      return { previousConversations };
    },
    onError: (error, _vars, context) => {
      // Rollback on error
      if (context?.previousConversations) {
        queryClient.setQueryData(["conversations", lawFirm?.id], context.previousConversations);
      }
      toast({
        title: "Erro ao mover conversa",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["chat-activity-actions"] });
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
    // Optimistic update: update local cache immediately to avoid visual flicker
    onMutate: async ({ clientId, statusId }) => {
      await queryClient.cancelQueries({ queryKey: ["conversations"] });

      const previousConversations = queryClient.getQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id]);

      queryClient.setQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id], (old) => {
        if (!old) return old;
        return old.map((conv) => {
          const client = conv.client as { id?: string; custom_status_id?: string | null } | null;
          if (client?.id === clientId) {
            return {
              ...conv,
              client: { ...client, custom_status_id: statusId },
            };
          }
          return conv;
        });
      });

      return { previousConversations };
    },
    onError: (error, _vars, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(["conversations", lawFirm?.id], context.previousConversations);
      }
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["all-scheduled-follow-ups"] });
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
