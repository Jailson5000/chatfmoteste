import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "@/hooks/useLawFirm";

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
  const { lawFirm } = useLawFirm();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["agenda-clients", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return [];
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .eq("is_agenda_client", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return data as AgendaClient[];
    },
  });

  // Realtime subscription for clients changes
  useEffect(() => {
    if (!lawFirm?.id) return;
    const channel = supabase
      .channel("agenda-clients-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clients",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["agenda-clients"] });
          queryClient.invalidateQueries({ queryKey: ["clients"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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

      // Normalize phone for comparison (remove non-digits)
      const normalizedPhone = (client.phone || "").replace(/\D/g, "");
      
      // Check if client with this phone already exists in contacts
      const { data: existingClient } = await supabase
        .from("clients")
        .select("*")
        .eq("law_firm_id", profile.law_firm_id)
        .eq("phone", normalizedPhone)
        .maybeSingle();

      if (existingClient) {
        // Client exists - update with agenda data and mark as agenda client
        const { data, error } = await supabase
          .from("clients")
          .update({
            name: client.name || existingClient.name,
            email: client.email || existingClient.email,
            document: client.document || existingClient.document,
            address: client.address || existingClient.address,
            notes: client.notes || existingClient.notes,
            birth_date: client.birth_date || existingClient.birth_date,
            birthday_message_enabled: client.birthday_message_enabled ?? existingClient.birthday_message_enabled ?? false,
            is_agenda_client: true,
          })
          .eq("id", existingClient.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      }

      // Client doesn't exist - create new one
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: client.name || "",
          phone: normalizedPhone,
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
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Cliente cadastrado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" });
    },
  });

  const updateClient = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AgendaClient> & { id: string }) => {
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase
        .from("clients")
        .update(updates)
        .eq("id", id)
        .eq("law_firm_id", lawFirm.id)
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
      if (!lawFirm?.id) throw new Error("Empresa não encontrada");
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
