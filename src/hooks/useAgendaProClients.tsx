import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";

export interface AgendaProClient {
  id: string;
  law_firm_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  birth_date: string | null;
  gender: string | null;
  address: string | null;
  notes: string | null;
  tags: string[] | null;
  is_active: boolean;
  preferred_professional_id: string | null;
  send_birthday_message: boolean;
  total_appointments: number;
  total_no_shows: number;
  last_appointment_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  preferred_professional?: { id: string; name: string } | null;
}

export function useAgendaProClients() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  // Fetch clients
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["agenda-pro-clients", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];

      const { data, error } = await supabase
        .from("agenda_pro_clients")
        .select(`
          *,
          preferred_professional:agenda_pro_professionals(id, name)
        `)
        .eq("law_firm_id", lawFirm.id)
        .order("name", { ascending: true });

      if (error) throw error;
      return data as AgendaProClient[];
    },
    enabled: !!lawFirm?.id,
  });

  // Create client
  const createClient = useMutation({
    mutationFn: async (data: Partial<AgendaProClient>) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const insertData = {
        law_firm_id: lawFirm.id,
        name: data.name || '',
        email: data.email || null,
        phone: data.phone || null,
        document: data.document || null,
        birth_date: data.birth_date || null,
        gender: data.gender || null,
        address: data.address || null,
        notes: data.notes || null,
        tags: data.tags || null,
        is_active: data.is_active ?? true,
        preferred_professional_id: data.preferred_professional_id || null,
        send_birthday_message: data.send_birthday_message ?? true,
      };

      const { data: client, error } = await supabase
        .from("agenda_pro_clients")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return client;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-clients"] });
      toast({ title: "Cliente criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
    },
  });

  // Update client
  const updateClient = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AgendaProClient> & { id: string }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("agenda_pro_clients")
        .update(updates)
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id) // Tenant validation
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-clients"] });
      toast({ title: "Cliente atualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  // Delete client
  const deleteClient = useMutation({
    mutationFn: async (id: string) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");

      const { error } = await supabase
        .from("agenda_pro_clients")
        .delete()
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id); // Tenant validation
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-pro-clients"] });
      toast({ title: "Cliente removido" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    },
  });

  // Search clients
  const searchClients = (query: string) => {
    if (!query.trim()) return clients;
    const q = query.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(q)
    );
  };

  // Find or create client by phone
  const findOrCreateByPhone = async (phone: string, name: string, email?: string) => {
    const existing = clients.find((c) => c.phone === phone);
    if (existing) return existing;

    const { data: created, error } = await supabase
      .from("agenda_pro_clients")
      .insert({
        law_firm_id: lawFirm?.id,
        name,
        phone,
        email,
      })
      .select()
      .single();

    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["agenda-pro-clients"] });
    return created as AgendaProClient;
  };

  return {
    clients,
    activeClients: clients.filter((c) => c.is_active),
    isLoading,
    createClient,
    updateClient,
    deleteClient,
    searchClients,
    findOrCreateByPhone,
  };
}
