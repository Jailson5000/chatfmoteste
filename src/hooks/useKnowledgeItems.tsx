import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLawFirm } from './useLawFirm';
import { useToast } from '@/hooks/use-toast';

export interface KnowledgeItem {
  id: string;
  law_firm_id: string;
  title: string;
  content: string | null;
  category: string;
  item_type: 'text' | 'document';
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
}

export interface AgentKnowledge {
  id: string;
  automation_id: string;
  knowledge_item_id: string;
  created_at: string;
  knowledge_items?: KnowledgeItem;
}

export function useKnowledgeItems() {
  const { lawFirm } = useLawFirm();
  const lawFirmId = lawFirm?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: knowledgeItems = [], isLoading, refetch } = useQuery({
    queryKey: ['knowledge-items', lawFirmId],
    queryFn: async () => {
      if (!lawFirmId) return [];
      
      const { data, error } = await supabase
        .from('knowledge_items')
        .select('*')
        .eq('law_firm_id', lawFirmId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as KnowledgeItem[];
    },
    enabled: !!lawFirmId,
  });

  const createItem = useMutation({
    mutationFn: async (item: Omit<KnowledgeItem, 'id' | 'law_firm_id' | 'created_at' | 'updated_at'>) => {
      if (!lawFirmId) throw new Error('Law firm not found');

      const { data, error } = await supabase
        .from('knowledge_items')
        .insert({ ...item, law_firm_id: lawFirmId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-items'] });
      toast({ title: 'Item criado', description: 'O conhecimento foi adicionado à base.' });
    },
    onError: (error) => {
      toast({ title: 'Erro', description: 'Não foi possível criar o item.', variant: 'destructive' });
      console.error(error);
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<KnowledgeItem> & { id: string }) => {
      if (!lawFirmId) throw new Error('Law firm not found');
      
      // SECURITY: Validate item belongs to user's law firm
      const { data, error } = await supabase
        .from('knowledge_items')
        .update(updates)
        .eq('id', id)
        .eq('law_firm_id', lawFirmId) // Tenant isolation
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-items'] });
      toast({ title: 'Item atualizado', description: 'As alterações foram salvas.' });
    },
    onError: (error) => {
      toast({ title: 'Erro', description: 'Não foi possível atualizar o item.', variant: 'destructive' });
      console.error(error);
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      if (!lawFirmId) throw new Error('Law firm not found');
      
      // SECURITY: Validate item belongs to user's law firm
      const { error } = await supabase
        .from('knowledge_items')
        .delete()
        .eq('id', id)
        .eq('law_firm_id', lawFirmId); // Tenant isolation

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-items'] });
      toast({ title: 'Item excluído', description: 'O conhecimento foi removido da base.' });
    },
    onError: (error) => {
      toast({ title: 'Erro', description: 'Não foi possível excluir o item.', variant: 'destructive' });
      console.error(error);
    },
  });

  return {
    knowledgeItems,
    isLoading,
    refetch,
    createItem,
    updateItem,
    deleteItem,
  };
}

export function useAgentKnowledge(automationId: string | undefined) {
  const { lawFirm } = useLawFirm();
  const lawFirmId = lawFirm?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: agentKnowledge = [], isLoading, refetch } = useQuery({
    queryKey: ['agent-knowledge', automationId],
    queryFn: async () => {
      if (!automationId) return [];

      const { data, error } = await supabase
        .from('agent_knowledge')
        .select('*, knowledge_items(*)')
        .eq('automation_id', automationId);

      if (error) throw error;
      return data as AgentKnowledge[];
    },
    enabled: !!automationId,
  });

  const linkKnowledge = useMutation({
    mutationFn: async (knowledgeItemId: string) => {
      if (!automationId) throw new Error('Automation ID required');
      if (!lawFirmId) throw new Error('Law firm ID required');

      const { data, error } = await supabase
        .from('agent_knowledge')
        .insert({ 
          automation_id: automationId, 
          knowledge_item_id: knowledgeItemId,
          law_firm_id: lawFirmId 
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-knowledge', automationId] });
      toast({ title: 'Conhecimento vinculado', description: 'O item foi vinculado ao agente.' });
    },
    onError: (error) => {
      toast({ title: 'Erro', description: 'Não foi possível vincular o item.', variant: 'destructive' });
      console.error(error);
    },
  });

  const unlinkKnowledge = useMutation({
    mutationFn: async (knowledgeItemId: string) => {
      if (!automationId) throw new Error('Automation ID required');
      if (!lawFirmId) throw new Error('Law firm ID required');

      // SECURITY: Include law_firm_id for defense in depth
      const { error } = await supabase
        .from('agent_knowledge')
        .delete()
        .eq('automation_id', automationId)
        .eq('knowledge_item_id', knowledgeItemId)
        .eq('law_firm_id', lawFirmId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-knowledge', automationId] });
      toast({ title: 'Conhecimento removido', description: 'O item foi desvinculado do agente.' });
    },
    onError: (error) => {
      toast({ title: 'Erro', description: 'Não foi possível remover o vínculo.', variant: 'destructive' });
      console.error(error);
    },
  });

  return {
    agentKnowledge,
    isLoading,
    refetch,
    linkKnowledge,
    unlinkKnowledge,
  };
}
