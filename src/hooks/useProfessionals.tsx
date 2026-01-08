import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Professional {
  id: string;
  law_firm_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  specialty: string | null;
  avatar_url: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined services
  services?: { id: string; name: string; color: string }[];
}

export interface ProfessionalService {
  id: string;
  professional_id: string;
  service_id: string;
}

export function useProfessionals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: professionals = [], isLoading } = useQuery({
    queryKey: ["professionals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select(`
          *,
          professional_services (
            service_id,
            services:service_id (id, name, color)
          )
        `)
        .order("name", { ascending: true });

      if (error) throw error;

      // Transform data to include services array
      return (data || []).map((prof: any) => ({
        ...prof,
        services: prof.professional_services?.map((ps: any) => ps.services).filter(Boolean) || [],
      })) as Professional[];
    },
  });

  const createProfessional = useMutation({
    mutationFn: async (professional: Partial<Professional> & { serviceIds?: string[] }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", auth.user.id)
        .single();

      if (!profile?.law_firm_id) throw new Error("Empresa não encontrada");

      const { serviceIds, ...profData } = professional;

      const { data, error } = await supabase
        .from("professionals")
        .insert({
          name: profData.name || "",
          email: profData.email,
          phone: profData.phone,
          document: profData.document,
          specialty: profData.specialty,
          notes: profData.notes,
          is_active: profData.is_active ?? true,
          law_firm_id: profile.law_firm_id,
        })
        .select()
        .single();

      if (error) throw error;

      // Link services if provided
      if (serviceIds && serviceIds.length > 0) {
        const { error: linkError } = await supabase
          .from("professional_services")
          .insert(
            serviceIds.map((serviceId) => ({
              professional_id: data.id,
              service_id: serviceId,
            }))
          );
        if (linkError) throw linkError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionals"] });
      toast({ title: "Profissional cadastrado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" });
    },
  });

  const updateProfessional = useMutation({
    mutationFn: async ({ id, serviceIds, ...updates }: Partial<Professional> & { id: string; serviceIds?: string[] }) => {
      const { data, error } = await supabase
        .from("professionals")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Update services if provided
      if (serviceIds !== undefined) {
        // Remove existing links
        await supabase.from("professional_services").delete().eq("professional_id", id);

        // Add new links
        if (serviceIds.length > 0) {
          const { error: linkError } = await supabase
            .from("professional_services")
            .insert(
              serviceIds.map((serviceId) => ({
                professional_id: id,
                service_id: serviceId,
              }))
            );
          if (linkError) throw linkError;
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionals"] });
      toast({ title: "Profissional atualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  const deleteProfessional = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("professionals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionals"] });
      toast({ title: "Profissional removido" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    },
  });

  const getProfessionalsByService = (serviceId: string) => {
    return professionals.filter(
      (p) => p.is_active && p.services?.some((s) => s.id === serviceId)
    );
  };

  return {
    professionals,
    activeProfessionals: professionals.filter((p) => p.is_active),
    isLoading,
    createProfessional,
    updateProfessional,
    deleteProfessional,
    getProfessionalsByService,
  };
}
