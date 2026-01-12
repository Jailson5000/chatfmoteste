import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Service {
  id: string;
  law_firm_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  price: number | null;
  color: string;
  is_active: boolean;
  position: number;
  // Return configuration
  return_enabled?: boolean;
  return_interval_days?: number | null;
  // Pre-appointment message configuration
  pre_message_enabled?: boolean;
  pre_message_text?: string | null;
  pre_message_hours_before?: number | null;
  created_at: string;
  updated_at: string;
}

export function useServices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .order("position", { ascending: true });

      if (error) throw error;
      return data as Service[];
    },
  });

  const createService = useMutation({
    mutationFn: async (service: Partial<Service>) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", auth.user.id)
        .single();

      if (!profile?.law_firm_id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("services")
        .insert({
          name: service.name || "",
          description: service.description,
          duration_minutes: service.duration_minutes || 30,
          buffer_before_minutes: service.buffer_before_minutes || 0,
          buffer_after_minutes: service.buffer_after_minutes || 0,
          price: service.price,
          color: service.color || "#6366f1",
          is_active: service.is_active ?? true,
          position: service.position || 0,
          law_firm_id: profile.law_firm_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast({ title: "Serviço criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar serviço", description: error.message, variant: "destructive" });
    },
  });

  const updateService = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Service> & { id: string }) => {
      const { data, error } = await supabase
        .from("services")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast({ title: "Serviço atualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  const deleteService = useMutation({
    mutationFn: async (id: string) => {
      // Check if there are appointments linked to this service
      const { count, error: countError } = await supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .eq("service_id", id);

      if (countError) throw countError;

      if (count && count > 0) {
        // Soft delete: deactivate instead of deleting to preserve appointment history
        const { error } = await supabase
          .from("services")
          .update({ is_active: false })
          .eq("id", id);
        
        if (error) throw error;
        
        return { softDeleted: true, appointmentCount: count };
      } else {
        // Hard delete: no appointments linked
        const { error } = await supabase.from("services").delete().eq("id", id);
        if (error) throw error;
        
        return { softDeleted: false };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      
      if (result?.softDeleted) {
        toast({ 
          title: "Serviço desativado", 
          description: `O serviço possui ${result.appointmentCount} agendamento(s) vinculado(s) e foi desativado ao invés de excluído.` 
        });
      } else {
        toast({ title: "Serviço removido" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    },
  });

  return {
    services,
    activeServices: services.filter((s) => s.is_active),
    isLoading,
    createService,
    updateService,
    deleteService,
  };
}
