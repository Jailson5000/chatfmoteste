import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface AgendaClient {
  id: string;
  law_firm_id: string;
  name: string;
  phone: string;
  email: string | null;
  document: string | null;
  address: string | null;
  notes: string | null;
  birth_date: string | null;
  birthday_message_enabled: boolean;
  is_agenda_client: boolean;
  created_at: string;
  updated_at: string;
}

export function useAgendaClients() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["agenda-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("is_agenda_client", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return data as AgendaClient[];
    },
  });

  const createClient = useMutation({
    mutationFn: async (client: Partial<AgendaClient>) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", auth.user.id)
        .single();

      if (!profile?.law_firm_id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: client.name || "",
          phone: client.phone || "",
          email: client.email,
          document: client.document,
          address: client.address,
          notes: client.notes,
          birth_date: client.birth_date,
          birthday_message_enabled: client.birthday_message_enabled ?? false,
          is_agenda_client: true,
          law_firm_id: profile.law_firm_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-clients"] });
      toast({ title: "Cliente cadastrado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" });
    },
  });

  const updateClient = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AgendaClient> & { id: string }) => {
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
      queryClient.invalidateQueries({ queryKey: ["agenda-clients"] });
      toast({ title: "Cliente atualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  const removeFromAgenda = useMutation({
    mutationFn: async (id: string) => {
      // Only remove from agenda (set is_agenda_client to false), don't delete the contact
      const { error } = await supabase
        .from("clients")
        .update({ is_agenda_client: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-clients"] });
      toast({ title: "Cliente removido da agenda" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    },
  });

  const searchClients = (query: string) => {
    if (!query) return clients;
    const lowerQuery = query.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.phone.includes(query) ||
        c.email?.toLowerCase().includes(lowerQuery)
    );
  };

  const getUpcomingBirthdays = (days: number = 30) => {
    const today = new Date();
    return clients
      .filter((c) => c.birth_date && c.birthday_message_enabled)
      .filter((c) => {
        const birth = new Date(c.birth_date!);
        const thisYear = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
        const nextYear = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
        const targetDate = thisYear >= today ? thisYear : nextYear;
        const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= days;
      })
      .sort((a, b) => {
        const birthA = new Date(a.birth_date!);
        const birthB = new Date(b.birth_date!);
        return birthA.getMonth() - birthB.getMonth() || birthA.getDate() - birthB.getDate();
      });
  };

  return {
    clients,
    isLoading,
    createClient,
    updateClient,
    removeFromAgenda,
    searchClients,
    getUpcomingBirthdays,
  };
}
