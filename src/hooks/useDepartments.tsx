import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "./useLawFirm";

export interface Department {
  id: string;
  law_firm_id: string;
  name: string;
  color: string;
  icon: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useDepartments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["departments", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];
      
      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .order("position", { ascending: true });

      if (error) throw error;
      return data as Department[];
    },
    enabled: !!lawFirm?.id,
  });

  const createDepartment = useMutation({
    mutationFn: async (department: { name: string; color: string; icon?: string }) => {
      const { data: profile } = await supabase.auth.getUser();
      if (!profile.user) throw new Error("Usuário não autenticado");

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", profile.user.id)
        .single();

      if (!userProfile?.law_firm_id) throw new Error("Escritório não encontrado");

      const maxPosition = departments.length > 0 
        ? Math.max(...departments.map(d => d.position)) + 1 
        : 0;

      const { data, error } = await supabase
        .from("departments")
        .insert({
          ...department,
          law_firm_id: userProfile.law_firm_id,
          position: maxPosition,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast({ title: "Departamento criado com sucesso" });
    },
    onError: (error) => {
      toast({ title: "Erro ao criar departamento", description: error.message, variant: "destructive" });
    },
  });

  const updateDepartment = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Department> & { id: string }) => {
      const { data, error } = await supabase
        .from("departments")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast({ title: "Departamento atualizado" });
    },
    onError: (error) => {
      toast({ title: "Erro ao atualizar departamento", description: error.message, variant: "destructive" });
    },
  });

  const deleteDepartment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast({ title: "Departamento excluído" });
    },
    onError: (error) => {
      toast({ title: "Erro ao excluir departamento", description: error.message, variant: "destructive" });
    },
  });

  const reorderDepartments = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) => 
        supabase.from("departments").update({ position: index }).eq("id", id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });

  return {
    departments,
    isLoading,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    reorderDepartments,
  };
}
