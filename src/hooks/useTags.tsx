import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "./useLawFirm";

export interface Tag {
  id: string;
  law_firm_id: string;
  name: string;
  color: string;
  created_at: string;
}

export function useTags() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["tags", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];
      
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .order("name", { ascending: true });

      if (error) throw error;
      return data as Tag[];
    },
    enabled: !!lawFirm?.id,
  });

  const createTag = useMutation({
    mutationFn: async (tag: { name: string; color: string }) => {
      const { data: profile } = await supabase.auth.getUser();
      if (!profile.user) throw new Error("Usuário não autenticado");

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", profile.user.id)
        .single();

      if (!userProfile?.law_firm_id) throw new Error("Escritório não encontrado");

      const { data, error } = await supabase
        .from("tags")
        .insert({
          ...tag,
          law_firm_id: userProfile.law_firm_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast({ title: "Etiqueta criada com sucesso" });
    },
    onError: (error) => {
      toast({ title: "Erro ao criar etiqueta", description: error.message, variant: "destructive" });
    },
  });

  const updateTag = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Tag> & { id: string }) => {
      if (!lawFirm?.id) throw new Error("Escritório não encontrado");
      
      // SECURITY: Validate tag belongs to user's law firm
      const { data, error } = await supabase
        .from("tags")
        .update(updates)
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id) // Tenant isolation
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast({ title: "Etiqueta atualizada" });
    },
    onError: (error) => {
      toast({ title: "Erro ao atualizar etiqueta", description: error.message, variant: "destructive" });
    },
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => {
      if (!lawFirm?.id) throw new Error("Escritório não encontrado");
      
      // SECURITY: Validate tag belongs to user's law firm
      const { error } = await supabase
        .from("tags")
        .delete()
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id); // Tenant isolation
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast({ title: "Etiqueta excluída" });
    },
    onError: (error) => {
      toast({ title: "Erro ao excluir etiqueta", description: error.message, variant: "destructive" });
    },
  });

  return {
    tags,
    isLoading,
    createTag,
    updateTag,
    deleteTag,
  };
}
