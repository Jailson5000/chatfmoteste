import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface StatusFollowUp {
  id: string;
  status_id: string;
  law_firm_id: string;
  template_id: string | null;
  delay_minutes: number;
  delay_unit: string;
  position: number;
  give_up_on_no_response: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  template?: {
    id: string;
    name: string;
    shortcut: string;
  };
}

export function useStatusFollowUps(statusId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: followUps = [], isLoading } = useQuery({
    queryKey: ["status-follow-ups", statusId],
    queryFn: async () => {
      if (!statusId) return [];

      const { data, error } = await supabase
        .from("status_follow_ups")
        .select(`
          *,
          template:templates(id, name, shortcut)
        `)
        .eq("status_id", statusId)
        .order("position", { ascending: true });

      if (error) throw error;
      return data as StatusFollowUp[];
    },
    enabled: !!statusId,
  });

  const createFollowUp = useMutation({
    mutationFn: async (followUp: {
      status_id: string;
      template_id?: string | null;
      delay_minutes: number;
      delay_unit: string;
      position: number;
      give_up_on_no_response?: boolean;
    }) => {
      const { data: profile } = await supabase.auth.getUser();
      if (!profile.user) throw new Error("Usuário não autenticado");

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", profile.user.id)
        .single();

      if (!userProfile?.law_firm_id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("status_follow_ups")
        .insert({
          ...followUp,
          law_firm_id: userProfile.law_firm_id,
        })
        .select(`
          *,
          template:templates(id, name, shortcut)
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status-follow-ups"] });
      toast({ title: "Follow-up adicionado" });
    },
    onError: (error) => {
      toast({ 
        title: "Erro ao adicionar follow-up", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const updateFollowUp = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<StatusFollowUp> & { id: string }) => {
      const { data, error } = await supabase
        .from("status_follow_ups")
        .update(updates)
        .eq("id", id)
        .select(`
          *,
          template:templates(id, name, shortcut)
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status-follow-ups"] });
      toast({ title: "Follow-up atualizado" });
    },
    onError: (error) => {
      toast({ 
        title: "Erro ao atualizar follow-up", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const deleteFollowUp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("status_follow_ups")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status-follow-ups"] });
      toast({ title: "Follow-up removido" });
    },
    onError: (error) => {
      toast({ 
        title: "Erro ao remover follow-up", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const reorderFollowUps = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) => ({
        id,
        position: index,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("status_follow_ups")
          .update({ position: update.position })
          .eq("id", update.id);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status-follow-ups"] });
    },
    onError: (error) => {
      toast({ 
        title: "Erro ao reordenar", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  return {
    followUps,
    isLoading,
    createFollowUp,
    updateFollowUp,
    deleteFollowUp,
    reorderFollowUps,
  };
}
