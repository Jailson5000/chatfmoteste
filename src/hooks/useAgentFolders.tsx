import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "./useLawFirm";
import { useToast } from "./use-toast";

export interface AgentFolder {
  id: string;
  name: string;
  color: string;
  law_firm_id: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateFolderParams {
  name: string;
  color?: string;
}

export interface UpdateFolderParams {
  id: string;
  name?: string;
  color?: string;
  position?: number;
}

export function useAgentFolders() {
  const { lawFirm } = useLawFirm();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: folders = [], isLoading, error, refetch } = useQuery({
    queryKey: ["agent-folders", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];
      
      const { data, error } = await supabase
        .from("agent_folders")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .order("position", { ascending: true });
      
      if (error) throw error;
      return data as AgentFolder[];
    },
    enabled: !!lawFirm?.id,
  });

  const createFolder = useMutation({
    mutationFn: async (params: CreateFolderParams) => {
      if (!lawFirm?.id) throw new Error("Law firm not found");
      
      const maxPosition = folders.length > 0 
        ? Math.max(...folders.map(f => f.position)) + 1 
        : 0;
      
      const { data, error } = await supabase
        .from("agent_folders")
        .insert({
          name: params.name,
          color: params.color || "#6366f1",
          law_firm_id: lawFirm.id,
          position: maxPosition,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-folders"] });
      toast({
        title: "Pasta criada",
        description: "A pasta foi criada com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao criar pasta",
        description: "Não foi possível criar a pasta.",
        variant: "destructive",
      });
    },
  });

  const updateFolder = useMutation({
    mutationFn: async (params: UpdateFolderParams) => {
      const { id, ...updates } = params;
      
      const { data, error } = await supabase
        .from("agent_folders")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-folders"] });
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar pasta",
        description: "Não foi possível atualizar a pasta.",
        variant: "destructive",
      });
    },
  });

  const deleteFolder = useMutation({
    mutationFn: async (folderId: string) => {
      const { error } = await supabase
        .from("agent_folders")
        .delete()
        .eq("id", folderId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-folders"] });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast({
        title: "Pasta excluída",
        description: "A pasta foi excluída. Os agentes foram movidos para fora da pasta.",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao excluir pasta",
        description: "Não foi possível excluir a pasta.",
        variant: "destructive",
      });
    },
  });

  const moveAgentToFolder = useMutation({
    mutationFn: async ({ agentId, folderId, position }: { agentId: string; folderId: string | null; position?: number }) => {
      const updates: { folder_id: string | null; position?: number } = { folder_id: folderId };
      if (position !== undefined) {
        updates.position = position;
      }
      
      const { error } = await supabase
        .from("automations")
        .update(updates)
        .eq("id", agentId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
    onError: () => {
      toast({
        title: "Erro ao mover agente",
        description: "Não foi possível mover o agente para a pasta.",
        variant: "destructive",
      });
    },
  });

  const reorderAgents = useMutation({
    mutationFn: async (updates: { id: string; position: number; folder_id: string | null }[]) => {
      // Update each agent's position
      for (const update of updates) {
        const { error } = await supabase
          .from("automations")
          .update({ position: update.position, folder_id: update.folder_id })
          .eq("id", update.id);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
    onError: () => {
      toast({
        title: "Erro ao reordenar",
        description: "Não foi possível reordenar os agentes.",
        variant: "destructive",
      });
    },
  });

  return {
    folders,
    isLoading,
    error,
    refetch,
    createFolder,
    updateFolder,
    deleteFolder,
    moveAgentToFolder,
    reorderAgents,
  };
}
