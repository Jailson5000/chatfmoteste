import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tables } from "@/integrations/supabase/types";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useUserDepartments, NO_DEPARTMENT_ID } from "@/hooks/useUserDepartments";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";

// Tracks optimistic updates to prevent refetch from reverting them
interface PendingOptimisticUpdate {
  fields: Record<string, any>;
  timestamp: number;
}
const OPTIMISTIC_LOCK_DURATION_MS = 3000; // 3 seconds protection window

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
  // Extend with archived_by_name from RPC (not in base Conversation type)
  archived_by_name?: string | null;
}

const CONVERSATIONS_BATCH_SIZE = 30;

// Helper function to map RPC response to ConversationWithLastMessage
function mapRpcRowToConversation(row: any): ConversationWithLastMessage {
  return {
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
    last_whatsapp_instance_id: row.last_whatsapp_instance_id,
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
    archived_by: row.archived_by,
    archived_by_name: row.archived_by_name,
    origin: row.origin,
    origin_metadata: row.origin_metadata,
    last_summarized_at: row.last_summarized_at,
    summary_message_count: row.summary_message_count,
    n8n_last_response_at: row.n8n_last_response_at,
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
  };
}

export function useConversations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm, isLoading: isLawFirmLoading } = useLawFirm();
  const { hasFullAccess, departmentIds: userDeptIds, userId, isLoading: permissionsLoading } = useUserDepartments();
  
  // Pagination state
  const [allConversations, setAllConversations] = useState<ConversationWithLastMessage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const offsetRef = useRef(0);
  const lawFirmIdRef = useRef<string | null>(null);
  
  // Mutation lock: protects optimistic updates from being overwritten by stale refetch data
  const pendingOptimisticUpdates = useRef<Map<string, PendingOptimisticUpdate>>(new Map());

  // Initial fetch query
  const { data: initialData, isLoading: dataLoading, error } = useQuery({
    queryKey: ["conversations", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      // Only reset pagination on tenant change or first load
      // On refetch (same tenant), keep offset intact to avoid re-paginating from zero
      const isRefetch = lawFirmIdRef.current === lawFirm.id;
      if (!isRefetch) {
        offsetRef.current = 0;
      }
      
      const { data, error: rpcError } = await supabase
        .rpc('get_conversations_with_metadata', { 
          _law_firm_id: lawFirm.id,
          _limit: CONVERSATIONS_BATCH_SIZE,
          _offset: 0,
          _include_archived: true
        });

      if (rpcError) {
        console.error('Error fetching conversations via RPC:', rpcError);
        throw rpcError;
      }

      const conversations = (data || []).map(mapRpcRowToConversation);
      
      // Update pagination state only on initial fetch (not refetch)
      if (!isRefetch) {
        offsetRef.current = conversations.length;
        setHasMore(conversations.length === CONVERSATIONS_BATCH_SIZE);
      }
      
      return conversations;
    },
    enabled: !!lawFirm?.id,
  });

  // Helper: register an optimistic update for a conversation
  const registerOptimisticUpdate = useCallback((conversationId: string, fields: Record<string, any>) => {
    pendingOptimisticUpdates.current.set(conversationId, {
      fields,
      timestamp: Date.now(),
    });
  }, []);

  // Helper: clear an optimistic update after a delay
  const clearOptimisticUpdateAfterDelay = useCallback((conversationId: string) => {
    setTimeout(() => {
      pendingOptimisticUpdates.current.delete(conversationId);
    }, OPTIMISTIC_LOCK_DURATION_MS);
  }, []);

  // Helper: merge fresh data with optimistic protection
  const mergeWithOptimisticProtection = useCallback((fresh: ConversationWithLastMessage, local: ConversationWithLastMessage): ConversationWithLastMessage => {
    const pending = pendingOptimisticUpdates.current.get(fresh.id);
    if (!pending) return fresh; // No pending optimistic update, use fresh data
    
    const elapsed = Date.now() - pending.timestamp;
    if (elapsed > OPTIMISTIC_LOCK_DURATION_MS) {
      // Lock expired, use fresh data
      pendingOptimisticUpdates.current.delete(fresh.id);
      return fresh;
    }
    
    // Lock active: use fresh data BUT preserve optimistically updated fields from local
    const merged = { ...fresh };
    for (const field of Object.keys(pending.fields)) {
      (merged as any)[field] = (local as any)[field];
    }
    return merged;
  }, []);

  // Sync initialData to allConversations state
  useEffect(() => {
    if (initialData && lawFirm?.id) {
      // If law firm changed, reset everything
      if (lawFirmIdRef.current !== lawFirm.id) {
        lawFirmIdRef.current = lawFirm.id;
        setAllConversations(initialData);
        offsetRef.current = initialData.length;
        setHasMore(initialData.length === CONVERSATIONS_BATCH_SIZE);
      } else {
        // Same law firm - merge with existing (for realtime updates)
        setAllConversations(prev => {
          const initialMap = new Map(initialData.map(c => [c.id, c]));
          
          // Update existing conversations with fresh data, BUT protect optimistic fields
          const updatedPrev = prev.map(c => {
            const fresh = initialMap.get(c.id);
            if (!fresh) return c; // Not in refetch, keep local
            return mergeWithOptimisticProtection(fresh, c);
          });
          
          // Add any new conversations from initialData that weren't in prev
          const existingIds = new Set(prev.map(c => c.id));
          const newConversations = initialData.filter(c => !existingIds.has(c.id));
          
          const combined = [...updatedPrev, ...newConversations];
          return combined.sort((a, b) => {
            const aTime = a.last_message_at 
              ? new Date(a.last_message_at).getTime() 
              : new Date(a.created_at).getTime();
            const bTime = b.last_message_at 
              ? new Date(b.last_message_at).getTime() 
              : new Date(b.created_at).getTime();
            return bTime - aTime;
          });
        });
      }
    }
  }, [initialData, lawFirm?.id, mergeWithOptimisticProtection]);

  // Load more conversations
  const loadMoreConversations = useCallback(async () => {
    if (!lawFirm?.id || isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    
    try {
      const { data, error: rpcError } = await supabase
        .rpc('get_conversations_with_metadata', { 
          _law_firm_id: lawFirm.id,
          _limit: CONVERSATIONS_BATCH_SIZE,
          _offset: offsetRef.current,
          _include_archived: true
        });

      if (rpcError) {
        console.error('Error loading more conversations:', rpcError);
        throw rpcError;
      }

      const newConversations = (data || []).map(mapRpcRowToConversation);
      
      if (newConversations.length > 0) {
        setAllConversations(prev => {
          const existingMap = new Map(prev.map(c => [c.id, c]));
          const result = [...prev];
          
          for (const newConv of newConversations) {
            const existing = existingMap.get(newConv.id);
            if (existing) {
              // Conversation already exists locally - merge with optimistic protection
              const merged = mergeWithOptimisticProtection(newConv, existing);
              const idx = result.findIndex(c => c.id === newConv.id);
              if (idx !== -1) result[idx] = merged;
            } else {
              // Truly new conversation - add it
              result.push(newConv);
            }
          }
          
          return result;
        });
        offsetRef.current += newConversations.length;
      }
      
      setHasMore(newConversations.length === CONVERSATIONS_BATCH_SIZE);
    } catch (error) {
      console.error('Failed to load more conversations:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [lawFirm?.id, isLoadingMore, hasMore, mergeWithOptimisticProtection]);

  // Filter conversations based on user department access
  const conversations = useMemo(() => {
    if (hasFullAccess) return allConversations;
    
    // Check if user has explicit permission to see "No Department" items
    const canSeeNoDepartment = userDeptIds.includes(NO_DEPARTMENT_ID);
    
    // Atendente sees:
    // 1. Conversations in their assigned departments
    // 2. Conversations assigned directly to them
    // 3. Conversations without department ONLY if they have explicit NO_DEPARTMENT_ID permission
    return allConversations.filter(conv => {
      // Conversation without department: requires explicit permission or direct assignment
      if (!conv.department_id) {
        return canSeeNoDepartment || conv.assigned_to === userId;
      }
      // Conversation with department: must have access to that department or be assigned
      return userDeptIds.includes(conv.department_id) || conv.assigned_to === userId;
    });
  }, [allConversations, hasFullAccess, userDeptIds, userId]);

  const isLoading = dataLoading || permissionsLoading || isLawFirmLoading;

  // ============================================================================
  // REALTIME: Handled by RealtimeSyncContext (centralized)
  // ============================================================================
  // The following tables are now monitored by RealtimeSyncProvider:
  // - conversations, clients, custom_statuses, departments, tags
  // - messages, scheduled_follow_ups, whatsapp_instances
  // All invalidations happen automatically via the context.
  // NO ADDITIONAL CHANNELS NEEDED HERE - reduces WebSocket overhead by ~75%
  // ============================================================================

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
      
      return { id, ...updates };
    },
    onMutate: async ({ id, ...updates }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["conversations"] });
      
      // Register optimistic lock to protect against stale refetch
      registerOptimisticUpdate(id, updates);
      
      // Optimistically update local state for immediate UI feedback
      setAllConversations(prev => 
        prev.map(conv => 
          conv.id === id ? { ...conv, ...updates } : conv
        )
      );
      
      return { id, updates };
    },
    onSuccess: (data) => {
      // Ensure local state is synced after successful mutation
      if (data) {
        setAllConversations(prev => 
          prev.map(conv => 
            conv.id === data.id ? { ...conv, ...data } : conv
          )
        );
      }
      // NOTE: Removed immediate invalidateQueries here - Realtime handles it via RealtimeSyncContext
      // The optimistic lock protects against stale data from the delayed refetch
    },
    onSettled: (_data, _error, variables) => {
      // Clear optimistic lock after delay (gives DB time to propagate)
      clearOptimisticUpdateAfterDelay(variables.id);
    },
    onError: (error, variables) => {
      // Revert on error by refetching
      pendingOptimisticUpdates.current.delete(variables.id); // cleanup using conversation ID
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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
      return { conversationId, status };
    },
    onMutate: async ({ conversationId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["conversations"] });
      
      const optimisticFields = { status };
      registerOptimisticUpdate(conversationId, optimisticFields);
      
      // Optimistically update local state
      setAllConversations(prev =>
        prev.map(conv =>
          conv.id === conversationId ? { ...conv, status: status as Conversation["status"] } : conv
        )
      );
      
      return { conversationId };
    },
    onSuccess: () => {
      // NOTE: Removed invalidateQueries here - Realtime handles it via RealtimeSyncContext
      // The optimistic lock protects against stale data from the delayed refetch
      toast({
        title: "Status atualizado",
        description: "O status da conversa foi atualizado com sucesso.",
      });
    },
    onSettled: (_data, _error, variables) => {
      clearOptimisticUpdateAfterDelay(variables.conversationId);
    },
    onError: (error, variables) => {
      pendingOptimisticUpdates.current.delete(variables.conversationId);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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
    onMutate: async (variables) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["conversations"] });
      const previousConversations = queryClient.getQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id]);

      const optimisticFields = {
        current_handler: variables.handlerType,
        assigned_to: variables.assignedTo || null,
        current_automation_id: variables.handlerType === 'ai' ? variables.automationId || null : null,
      };
      
      // Register optimistic lock
      registerOptimisticUpdate(variables.conversationId, optimisticFields);

      // Optimistically update local state for immediate UI feedback
      setAllConversations(prev =>
        prev.map(conv =>
          conv.id === variables.conversationId
            ? { ...conv, ...optimisticFields }
            : conv
        )
      );

      return { previousConversations };
    },
    onSuccess: async (_data, variables) => {
      // No manual invalidation here - Realtime via RealtimeSyncContext handles refetch
      // Manual invalidation was causing race conditions that reverted optimistic updates
      toast({
        title: "Transferência realizada",
        description:
          variables.handlerType === "ai"
            ? "A conversa foi transferida para a IA selecionada."
            : "A conversa foi transferida para o atendente selecionado.",
      });
    },
    onSettled: (_data, _error, variables) => {
      clearOptimisticUpdateAfterDelay(variables.conversationId);
    },
    onError: (error, _variables, context) => {
      // Rollback optimistic update on error
      if (context?.previousConversations) {
        queryClient.setQueryData(["conversations", lawFirm?.id], context.previousConversations);
      }
      pendingOptimisticUpdates.current.delete(_variables.conversationId);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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

      // Build full department object from cache for immediate Kanban rendering
      let departmentObject: { id: string; name: string; color: string } | null = null;
      if (departmentId) {
        const cachedDepartments = queryClient.getQueryData<any[]>(["departments", lawFirm?.id]);
        const dept = cachedDepartments?.find((d: any) => d.id === departmentId);
        if (dept) {
          departmentObject = { id: dept.id, name: dept.name, color: dept.color || '#gray' };
        }
      }

      const optimisticFields: Record<string, any> = { 
        department_id: departmentId,
        department: departmentObject,
      };
      
      // Register optimistic lock to protect against stale refetch
      registerOptimisticUpdate(conversationId, optimisticFields);

      // Optimistically update to the new department in queryClient
      queryClient.setQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id], (old) => {
        if (!old) return old;
        return old.map((conv) =>
          conv.id === conversationId
            ? { ...conv, ...optimisticFields }
            : conv
        );
      });

      // CRITICAL: Also update local state for immediate UI response during rapid drags
      setAllConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId 
            ? { ...conv, ...optimisticFields } 
            : conv
        )
      );

      return { previousConversations };
    },
    onError: (error, _vars, context) => {
      // Rollback on error - both queryClient and local state
      pendingOptimisticUpdates.current.delete(_vars.conversationId);
      if (context?.previousConversations) {
        queryClient.setQueryData(["conversations", lawFirm?.id], context.previousConversations);
        setAllConversations(context.previousConversations);
      }
      toast({
        title: "Erro ao mover conversa",
        description: error.message,
        variant: "destructive",
      });
    },
    onSuccess: () => {
      // No manual invalidation here - Realtime via RealtimeSyncContext handles refetch
      // Manual invalidation was causing race conditions that reverted optimistic updates
    },
    onSettled: (_data, _error, variables) => {
      clearOptimisticUpdateAfterDelay(variables.conversationId);
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
    onMutate: async ({ conversationId, tags }) => {
      await queryClient.cancelQueries({ queryKey: ["conversations"] });
      const previousConversations = queryClient.getQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id]);

      queryClient.setQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id], (old) => {
        if (!old) return old;
        return old.map(conv => conv.id === conversationId ? { ...conv, tags } : conv);
      });

      setAllConversations(prev =>
        prev.map(conv => conv.id === conversationId ? { ...conv, tags } : conv)
      );

      registerOptimisticUpdate(conversationId, { tags });

      return { previousConversations };
    },
    onError: (error, _vars, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(["conversations", lawFirm?.id], context.previousConversations);
        setAllConversations(context.previousConversations);
      }
      toast({
        title: "Erro ao atualizar etiquetas",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: (_data, _error, variables) => {
      clearOptimisticUpdateAfterDelay(variables.conversationId);
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

      // Lookup full status object from cache for immediate UI update
      const cachedStatuses = queryClient.getQueryData<Array<{id: string; name: string; color: string}>>(
        ["custom_statuses", lawFirm?.id]
      );
      const statusObj = statusId 
        ? cachedStatuses?.find(s => s.id === statusId) || null 
        : null;

      const previousConversations = queryClient.getQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id]);

      const updateClient = (client: any) => ({
        ...client,
        custom_status_id: statusId,
        custom_status: statusObj ? { id: statusObj.id, name: statusObj.name, color: statusObj.color } : null,
      });

      queryClient.setQueryData<ConversationWithLastMessage[]>(["conversations", lawFirm?.id], (old) => {
        if (!old) return old;
        return old.map((conv) => {
          const client = conv.client as { id?: string; custom_status_id?: string | null } | null;
          if (client?.id === clientId) {
            return { ...conv, client: updateClient(client) };
          }
          return conv;
        });
      });

      // CRITICAL: Also update local state for immediate UI response during rapid drags
      setAllConversations(prev => 
        prev.map(conv => {
          const client = conv.client as { id?: string; custom_status_id?: string | null } | null;
          if (client?.id === clientId) {
            return { ...conv, client: updateClient(client) };
          }
          return conv;
        })
      );

      // Register optimistic lock to protect against stale refetch
      const targetConv = allConversations.find(c => {
        const cl = c.client as { id?: string } | null;
        return cl?.id === clientId;
      });
      if (targetConv) {
        registerOptimisticUpdate(targetConv.id, { client: { custom_status_id: statusId, custom_status: statusObj } });
      }

      return { previousConversations, targetConvId: targetConv?.id };
    },
    onError: (error, _vars, context) => {
      // Rollback on error - both queryClient and local state
      if (context?.previousConversations) {
        queryClient.setQueryData(["conversations", lawFirm?.id], context.previousConversations);
        setAllConversations(context.previousConversations);
      }
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: (_data, _error, _variables, context) => {
      // Clear optimistic lock after delay
      if (context?.targetConvId) {
        clearOptimisticUpdateAfterDelay(context.targetConvId);
      }
      // NOTE: Removed invalidateQueries(["conversations"]) - Realtime handles it
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

  // Mutation específica para troca de instância WhatsApp com mensagem de sistema
  // Helper function to check for existing conversation in destination
  const checkExistingConversationInDestination = async (
    conversationId: string,
    newInstanceId: string,
    lawFirmId: string
  ): Promise<{ exists: boolean; existingConvId?: string; existingConvName?: string }> => {
    // Get current conversation data
    const { data: currentConversation } = await supabase
      .from("conversations")
      .select("remote_jid, contact_name")
      .eq("id", conversationId)
      .single();

    if (!currentConversation?.remote_jid) {
      return { exists: false };
    }

    // Check if there's a conversation with same remote_jid in destination
    const { data: existingConvs } = await supabase
      .from("conversations")
      .select("id, contact_name")
      .eq("law_firm_id", lawFirmId)
      .eq("whatsapp_instance_id", newInstanceId)
      .eq("remote_jid", currentConversation.remote_jid)
      .neq("id", conversationId)
      .limit(1);

    if (existingConvs && existingConvs.length > 0) {
      return { 
        exists: true, 
        existingConvId: existingConvs[0].id,
        existingConvName: existingConvs[0].contact_name || "Sem nome"
      };
    }

    return { exists: false };
  };

  const changeWhatsAppInstance = useMutation({
    mutationFn: async ({
      conversationId,
      newInstanceId,
      oldInstanceName,
      newInstanceName,
      oldPhoneDigits,
      newPhoneDigits,
      forceUnify = false,
    }: {
      conversationId: string;
      newInstanceId: string;
      oldInstanceName: string;
      newInstanceName: string;
      oldPhoneDigits?: string;
      newPhoneDigits?: string;
      forceUnify?: boolean;
    }) => {
      if (!lawFirm?.id) throw new Error("Escritório não encontrado");

      // 1. Buscar dados da conversa atual (client_id e telefone)
      const { data: currentConversation } = await supabase
        .from("conversations")
        .select("client_id, contact_phone, remote_jid")
        .eq("id", conversationId)
        .single();

      // 2. Verificar se já existe uma conversa com o mesmo remote_jid na instância de DESTINO
      let existingConversationInDestination = null;
      if (currentConversation?.remote_jid) {
        const { data: existingConvs } = await supabase
          .from("conversations")
          .select("id, client_id")
          .eq("law_firm_id", lawFirm.id)
          .eq("whatsapp_instance_id", newInstanceId)
          .eq("remote_jid", currentConversation.remote_jid)
          .neq("id", conversationId)
          .limit(1);
        
        existingConversationInDestination = existingConvs?.[0] || null;
      }

      // 4. Se já existe uma conversa no destino e forceUnify não foi ativado, lançar erro especial
      if (existingConversationInDestination && !forceUnify) {
        const error = new Error("CONFLICT_EXISTS");
        (error as any).conflictData = {
          existingConvId: existingConversationInDestination.id,
        };
        throw error;
      }

      // 5. Se forceUnify está ativado, EXCLUIR a conversa existente no destino E SEU CLIENTE
      if (existingConversationInDestination && forceUnify) {
        const destinationClientId = existingConversationInDestination.client_id;
        const originClientId = currentConversation?.client_id;
        
        console.log("[changeWhatsAppInstance] Force unify - Destination client:", destinationClientId, "Origin client:", originClientId);
        
        // Primeiro, excluir mensagens associadas à conversa antiga
        await supabase
          .from("messages")
          .delete()
          .eq("conversation_id", existingConversationInDestination.id);
        
        // Excluir a conversa duplicada no destino
        const deletedConvId = existingConversationInDestination.id;
        await supabase
          .from("conversations")
          .delete()
          .eq("id", deletedConvId)
          .eq("law_firm_id", lawFirm.id);
        
        // CRITICAL: Invalidar IMEDIATAMENTE para remover a conversa da lista do sidebar
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["conversation-counts"] });
        
        // Também remover do cache local para atualização instantânea
        queryClient.setQueryData(
          ["conversations", lawFirm.id],
          (old: any) => old?.filter((c: any) => c.id !== deletedConvId) || []
        );
        
        // Forçar refetch imediato para garantir sincronização
        await queryClient.refetchQueries({ queryKey: ["conversations", lawFirm.id] });

        // IMPORTANTE: Só excluir o cliente do destino se for DIFERENTE do cliente de origem
        // Isso evita excluir o cliente da conversa que está sendo movida
        if (destinationClientId && destinationClientId !== originClientId) {
          console.log("[changeWhatsAppInstance] Deleting destination client:", destinationClientId);
          
          // Excluir tags do cliente primeiro (evitar FK constraint)
          await supabase
            .from("client_tags")
            .delete()
            .eq("client_id", destinationClientId);
          
          // Excluir o cliente do destino
          await supabase
            .from("clients")
            .delete()
            .eq("id", destinationClientId)
            .eq("law_firm_id", lawFirm.id);
        } else if (destinationClientId === originClientId) {
          console.log("[changeWhatsAppInstance] Skipping client deletion - same client as origin");
        }
      }

      // 6. Atualizar a conversa com a nova instância
      const { error: updateError } = await supabase
        .from("conversations")
        .update({ whatsapp_instance_id: newInstanceId })
        .eq("id", conversationId)
        .eq("law_firm_id", lawFirm.id);

      if (updateError) throw updateError;

      // 7. Tratar o cliente vinculado à conversa movida
      if (currentConversation?.client_id) {
        // Atualizar o cliente existente para a nova instância (mantém status, tags, etc.)
        await supabase
          .from("clients")
          .update({ whatsapp_instance_id: newInstanceId })
          .eq("id", currentConversation.client_id)
          .eq("law_firm_id", lawFirm.id);
      }

      // 8. Inserir mensagem de sistema no chat
      const oldLabel = oldPhoneDigits ? `${oldInstanceName} (...${oldPhoneDigits})` : oldInstanceName;
      const newLabel = newPhoneDigits ? `${newInstanceName} (...${newPhoneDigits})` : newInstanceName;
      
      const { data: insertedMsg, error: msgError } = await supabase
        .from("messages")
        .insert([{
          conversation_id: conversationId,
          content: `📱 Canal alterado de "${oldLabel}" para "${newLabel}"`,
          message_type: "note",
          sender_type: "system",
          is_from_me: true,
          is_internal: true,
          ai_generated: false,
          status: "read",
        }])
        .select()
        .single();

      if (msgError) {
        console.error("[changeWhatsAppInstance] Error inserting system message:", msgError);
        throw msgError;
      }
      
      console.log("[changeWhatsAppInstance] System message inserted successfully:", insertedMsg?.id);
      
      // Retornar dados para o onSuccess usar
      return { conversationId, insertedMsg };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation-counts"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      
      // CRITICAL: Invalidar mensagens com a query key específica da conversa
      // para forçar refetch e exibir a mensagem de sistema
      if (result?.conversationId) {
        queryClient.invalidateQueries({ queryKey: ["messages", result.conversationId] });
      }
      toast({
        title: "Canal alterado",
        description: "A conversa foi movida para o novo canal WhatsApp.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao alterar canal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch a single conversation by ID directly from the database
  // Used for deep-links when the conversation isn't in the local paginated state
  const fetchSingleConversation = useCallback(async (conversationId: string) => {
    if (!lawFirm?.id) return null;
    
    // Direct query by ID — no profiles join (FK points to auth.users, not public.profiles)
    const { data: directData, error: directError } = await supabase
      .from('conversations')
      .select(`
        *,
        last_message:messages(content, created_at, message_type, is_from_me),
        whatsapp_instance:whatsapp_instances!conversations_whatsapp_instance_id_fkey(instance_name, display_name, phone_number),
        current_automation:automations!conversations_current_automation_id_fkey(id, name),
        client:clients(id, custom_status_id, avatar_url, custom_status:custom_statuses(id, name, color)),
        department:departments(id, name, color)
      `)
      .eq('id', conversationId)
      .eq('law_firm_id', lawFirm.id)
      .order('created_at', { referencedTable: 'messages', ascending: false })
      .limit(1, { referencedTable: 'messages' })
      .maybeSingle();

    if (directError || !directData) {
      console.error('[fetchSingleConversation] Direct query error:', directError);
      return null;
    }

    // Fetch assigned profile separately (FK goes to auth.users, not profiles)
    let assignedProfile: { full_name: string } | null = null;
    if ((directData as any).assigned_to) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', (directData as any).assigned_to)
        .maybeSingle();
      assignedProfile = profile;
    }

    // Map to the same structure as mapRpcRowToConversation
    const conv: any = {
      ...directData,
      assigned_profile: assignedProfile,
      last_message: Array.isArray(directData.last_message) ? directData.last_message[0] || null : directData.last_message,
      unread_count: 0,
      client_tags: [],
      archived_by_name: null,
    };

    return conv as ConversationWithLastMessage;
  }, [lawFirm?.id]);

  return {
    conversations,
    isLoading,
    error,
    // Pagination
    loadMoreConversations,
    hasMoreConversations: hasMore,
    isLoadingMoreConversations: isLoadingMore,
    // Mutations
    updateConversation,
    updateConversationStatus,
    updateConversationDepartment,
    updateConversationTags,
    updateClientStatus,
    updateConversationAudioMode,
    transferHandler,
    changeWhatsAppInstance,
    // Helpers
    checkExistingConversationInDestination,
    // State management for shared optimistic updates
    setAllConversations,
    registerOptimisticUpdate,
    clearOptimisticUpdateAfterDelay,
    // Deep-link support
    fetchSingleConversation,
  };
}
