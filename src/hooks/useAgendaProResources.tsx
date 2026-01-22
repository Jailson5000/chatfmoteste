import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";

export interface AgendaProResource {
  id: string;
  law_firm_id: string;
  name: string;
  description: string | null;
  type: string;
  capacity: number;
  color: string;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export function useAgendaProResources() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  // Fetch resources
  const { data: resources = [], isLoading } = useQuery({
    queryKey: ["agenda-pro-resources", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      const { data, error } = await supabase
        .from("agenda_pro_resources")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .order("position", { ascending: true });

      if (error) throw error;
      return data as AgendaProResource[];
    },
    enabled: !!lawFirm?.id,
  });

  // Create resource
  const createResource = useMutation({
    mutationFn: async (data: Partial<AgendaProResource>) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const insertData = {
        law_firm_id: lawFirm.id,
        name: data.name || '',
        description: data.description || null,
        type: data.type || 'room',
        capacity: data.capacity || 1,
        color: data.color || '#10b981',
        is_active: data.is_active ?? true,
        position: data.position || 0,
      };

      const { data: resource, error } = await supabase
        .from("agenda_pro_resources")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return resource;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-resources"] });
      toast({ title: "Recurso criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
    },
  });

  // Update resource
  const updateResource = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AgendaProResource> & { id: string }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("agenda_pro_resources")
        .update(updates)
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id) // Tenant validation
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-resources"] });
      toast({ title: "Recurso atualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  // Delete resource
  const deleteResource = useMutation({
    mutationFn: async (id: string) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { error } = await supabase
        .from("agenda_pro_resources")
        .delete()
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id); // Tenant validation
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-resources"] });
      toast({ title: "Recurso removido" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    },
  });

  return {
    resources,
    activeResources: resources.filter((r) => r.is_active),
    rooms: resources.filter((r) => r.type === "room" && r.is_active),
    equipment: resources.filter((r) => r.type === "equipment" && r.is_active),
    isLoading,
    createResource,
    updateResource,
    deleteResource,
  };
}
