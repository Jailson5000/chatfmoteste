import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Tutorial {
  id: string;
  title: string;
  description: string | null;
  youtube_id: string;
  category: string;
  thumbnail_url: string | null;
  duration: string | null;
  is_active: boolean;
  is_featured: boolean;
  position: number;
  context: string | null;
  prerequisites: string[] | null;
  created_at: string;
  updated_at: string;
}

export type TutorialInsert = Omit<Tutorial, 'id' | 'created_at' | 'updated_at'>;
export type TutorialUpdate = Partial<TutorialInsert>;

export function useTutorials(onlyActive = true) {
  return useQuery({
    queryKey: ["tutorials", onlyActive],
    queryFn: async () => {
      let query = supabase
        .from("tutorials")
        .select("*")
        .order("position", { ascending: true });
      
      if (onlyActive) {
        query = query.eq("is_active", true);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as Tutorial[];
    },
  });
}

export function useCreateTutorial() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (tutorial: TutorialInsert) => {
      const { data, error } = await supabase
        .from("tutorials")
        .insert(tutorial)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tutorials"] });
      toast.success("Tutorial criado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar tutorial: " + error.message);
    },
  });
}

export function useUpdateTutorial() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: TutorialUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("tutorials")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tutorials"] });
      toast.success("Tutorial atualizado!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });
}

export function useDeleteTutorial() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tutorials")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tutorials"] });
      toast.success("Tutorial removido!");
    },
    onError: (error) => {
      toast.error("Erro ao remover: " + error.message);
    },
  });
}
