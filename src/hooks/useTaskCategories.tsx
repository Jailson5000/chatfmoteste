import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useToast } from "@/hooks/use-toast";

export interface TaskCategory {
  id: string;
  law_firm_id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export function useTaskCategories() {
  const { lawFirm } = useLawFirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["task_categories", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      const { data, error } = await supabase
        .from("task_categories")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .order("position", { ascending: true });

      if (error) throw error;
      return data as TaskCategory[];
    },
    enabled: !!lawFirm?.id,
  });

  const createCategory = useMutation({
    mutationFn: async (input: { name: string; color: string }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { data: maxPosData } = await supabase
        .from("task_categories")
        .select("position")
        .eq("law_firm_id", lawFirm.id)
        .order("position", { ascending: false })
        .limit(1);

      const nextPosition = (maxPosData?.[0]?.position || 0) + 1;

      const { data, error } = await supabase
        .from("task_categories")
        .insert({
          law_firm_id: lawFirm.id,
          name: input.name,
          color: input.color,
          position: nextPosition,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task_categories"] });
      toast({ title: "Categoria criada" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar categoria",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateCategory = useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      color?: string;
      position?: number;
    }) => {
      const { id, ...updates } = input;

      const { error } = await supabase
        .from("task_categories")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task_categories"] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase
        .from("task_categories")
        .delete()
        .eq("id", categoryId);

      if (error) throw error;
      return categoryId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task_categories"] });
      toast({ title: "Categoria excluída" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir categoria",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const initializeDefaultCategories = useMutation({
    mutationFn: async () => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { error } = await supabase.rpc("create_default_task_categories", {
        _law_firm_id: lawFirm.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task_categories"] });
    },
  });

  return {
    categories,
    isLoading,
    createCategory,
    updateCategory,
    deleteCategory,
    initializeDefaultCategories,
  };
}
