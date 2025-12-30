import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  billing_period: string;
  max_users: number;
  max_instances: number;
  max_messages: number | null;
  max_ai_conversations: number;
  max_tts_minutes: number;
  max_agents: number;
  max_workspaces: number;
  features: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CreatePlanData {
  name: string;
  description?: string;
  price: number;
  billing_period?: string;
  max_users?: number;
  max_instances?: number;
  max_messages?: number;
  max_ai_conversations?: number;
  max_tts_minutes?: number;
  max_agents?: number;
  max_workspaces?: number;
  features?: string[];
  is_active?: boolean;
}

export function usePlans() {
  const queryClient = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("price", { ascending: true });

      if (error) throw error;
      return data as Plan[];
    },
  });

  const createPlan = useMutation({
    mutationFn: async (planData: CreatePlanData) => {
      const { data, error } = await supabase
        .from("plans")
        .insert(planData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plano criado com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao criar plano: " + error.message);
    },
  });

  const updatePlan = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<CreatePlanData>) => {
      const { error } = await supabase
        .from("plans")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plano atualizado com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar plano: " + error.message);
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("plans")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plano excluído com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao excluir plano: " + error.message);
    },
  });

  return {
    plans,
    isLoading,
    createPlan,
    updatePlan,
    deletePlan,
  };
}
