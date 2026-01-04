import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "./useLawFirm";

export interface CustomStatus {
  id: string;
  law_firm_id: string;
  name: string;
  color: string;
  description?: string;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useCustomStatuses() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  const { data: statuses = [], isLoading } = useQuery({
    queryKey: ["custom_statuses", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];
      
      const { data, error } = await supabase
        .from("custom_statuses")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .order("position", { ascending: true });

      if (error) throw error;
      return data as CustomStatus[];
    },
    enabled: !!lawFirm?.id,
  });

  const createStatus = useMutation({
    mutationFn: async (status: { name: string; color: string }) => {
      const { data: profile } = await supabase.auth.getUser();
      if (!profile.user) throw new Error("Usuário não autenticado");

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", profile.user.id)
        .single();

      if (!userProfile?.law_firm_id) throw new Error("Escritório não encontrado");

      const maxPosition = statuses.length > 0 
        ? Math.max(...statuses.map(s => s.position)) + 1 
        : 0;

      const { data, error } = await supabase
        .from("custom_statuses")
        .insert({
          ...status,
          law_firm_id: userProfile.law_firm_id,
          position: maxPosition,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom_statuses"] });
      toast({ title: "Status criado com sucesso" });
    },
    onError: (error) => {
      toast({ title: "Erro ao criar status", description: error.message, variant: "destructive" });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CustomStatus> & { id: string }) => {
      const { data, error } = await supabase
        .from("custom_statuses")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom_statuses"] });
      toast({ title: "Status atualizado" });
    },
    onError: (error) => {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    },
  });

  const deleteStatus = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_statuses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom_statuses"] });
      toast({ title: "Status excluído" });
    },
    onError: (error) => {
      toast({ title: "Erro ao excluir status", description: error.message, variant: "destructive" });
    },
  });

  return {
    statuses,
    isLoading,
    createStatus,
    updateStatus,
    deleteStatus,
  };
}
