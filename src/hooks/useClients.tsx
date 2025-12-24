import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Client {
  id: string;
  law_firm_id: string;
  name: string;
  phone: string;
  email: string | null;
  document: string | null;
  address: string | null;
  notes: string | null;
  lgpd_consent: boolean;
  lgpd_consent_date: string | null;
  custom_status_id: string | null;
  department_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useClients() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Client[];
    },
  });

  const createClient = useMutation({
    mutationFn: async (client: Omit<Client, "id" | "law_firm_id" | "created_at" | "updated_at">) => {
      const { data: profile } = await supabase.auth.getUser();
      if (!profile.user) throw new Error("Usuário não autenticado");

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", profile.user.id)
        .single();

      if (!userProfile?.law_firm_id) throw new Error("Escritório não encontrado");

      const { data, error } = await supabase
        .from("clients")
        .insert({
          ...client,
          law_firm_id: userProfile.law_firm_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Contato criado com sucesso" });
    },
    onError: (error) => {
      toast({ title: "Erro ao criar contato", description: error.message, variant: "destructive" });
    },
  });

  const updateClient = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Client> & { id: string }) => {
      const { data, error } = await supabase
        .from("clients")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Contato atualizado" });
    },
    onError: (error) => {
      toast({ title: "Erro ao atualizar contato", description: error.message, variant: "destructive" });
    },
  });

  const deleteClient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Contato excluído" });
    },
    onError: (error) => {
      toast({ title: "Erro ao excluir contato", description: error.message, variant: "destructive" });
    },
  });

  const moveClientToDepartment = useMutation({
    mutationFn: async ({ clientId, departmentId }: { clientId: string; departmentId: string | null }) => {
      const { data, error } = await supabase
        .from("clients")
        .update({ department_id: departmentId })
        .eq("id", clientId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  const updateClientStatus = useMutation({
    mutationFn: async ({ clientId, statusId }: { clientId: string; statusId: string | null }) => {
      const { data, error } = await supabase
        .from("clients")
        .update({ custom_status_id: statusId })
        .eq("id", clientId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  return {
    clients,
    isLoading,
    createClient,
    updateClient,
    deleteClient,
    moveClientToDepartment,
    updateClientStatus,
  };
}
