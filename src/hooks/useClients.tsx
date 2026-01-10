import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";

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
  whatsapp_instance_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  whatsapp_instance?: {
    id: string;
    instance_name: string;
    display_name: string | null;
    phone_number: string | null;
  } | null;
}

export function useClients() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      const { data, error } = await supabase
        .from("clients")
        .select(`
          *,
          whatsapp_instance:whatsapp_instances(id, instance_name, display_name, phone_number)
        `)
        .eq("law_firm_id", lawFirm.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Client[];
    },
    enabled: !!lawFirm?.id,
  });

  const createClient = useMutation({
    mutationFn: async (client: Omit<Client, "id" | "law_firm_id" | "created_at" | "updated_at">) => {
      const { data: profile } = await supabase.auth.getUser();
      if (!profile.user) throw new Error("Usuário não autenticado");
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("clients")
        .insert({
          ...client,
          law_firm_id: lawFirm.id,
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
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");
      
      // SECURITY: Validate client belongs to user's law firm
      const { data, error } = await supabase
        .from("clients")
        .update(updates)
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id) // Tenant isolation
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
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      // Some related tables use RESTRICT/NO ACTION FKs; clean them first
      // (best-effort: ignore if the table doesn't exist / user has no access)
      try {
        await supabase.from("tray_customer_map" as any).delete().eq("local_client_id", id);
      } catch {
        // ignore
      }

      const { error: googleLogsError } = await supabase
        .from("google_calendar_ai_logs")
        .update({ client_id: null })
        .eq("client_id", id);
      if (googleLogsError) throw googleLogsError;

      // SECURITY: Validate client belongs to user's law firm
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id); // Tenant isolation
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({ title: "Contato excluído" });
    },
    onError: (error) => {
      toast({ title: "Erro ao excluir contato", description: error.message, variant: "destructive" });
    },
  });

  const moveClientToDepartment = useMutation({
    mutationFn: async ({ clientId, departmentId }: { clientId: string; departmentId: string | null }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");
      
      // SECURITY: Validate client belongs to user's law firm
      const { data, error } = await supabase
        .from("clients")
        .update({ department_id: departmentId })
        .eq("id", clientId)
        .eq("law_firm_id", lawFirm.id) // Tenant isolation
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
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      // Non-null status: use the DB function that cancels + recreates follow-ups reliably
      if (statusId) {
        const { data, error } = await supabase.rpc("update_client_status_with_follow_ups", {
          _client_id: clientId,
          _new_status_id: statusId,
        });
        if (error) throw error;
        return data as any;
      }

      // Clearing status: update + cancel any pending follow-ups
      // SECURITY: Validate client belongs to user's law firm
      const { error: updateError } = await supabase
        .from("clients")
        .update({ custom_status_id: null })
        .eq("id", clientId)
        .eq("law_firm_id", lawFirm.id); // Tenant isolation

      if (updateError) throw updateError;

      const { error: cancelError } = await supabase
        .from("scheduled_follow_ups")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancel_reason: "Status cleared",
        })
        .eq("client_id", clientId)
        .eq("status", "pending")
        .eq("law_firm_id", lawFirm.id); // Tenant isolation

      if (cancelError) throw cancelError;

      return { success: true, cleared: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["all-scheduled-follow-ups"] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unifyDuplicates = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.auth.getUser();
      if (!profile.user) throw new Error("Usuário não autenticado");
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase.rpc("unify_duplicate_clients", {
        _law_firm_id: lawFirm.id,
      });

      if (error) throw error;
      return data as { success: boolean; deleted_count: number; unified_phones: string[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (data.deleted_count > 0) {
        toast({
          title: `${data.deleted_count} contatos duplicados unificados`,
          description: `Telefones unificados: ${data.unified_phones.length}`,
        });
      } else {
        toast({ title: "Nenhum contato duplicado encontrado" });
      }
    },
    onError: (error) => {
      toast({ title: "Erro ao unificar duplicados", description: error.message, variant: "destructive" });
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
    unifyDuplicates,
  };
}
