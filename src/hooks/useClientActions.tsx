import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ClientAction {
  id: string;
  law_firm_id: string;
  client_id: string;
  action_type: string;
  from_value: string | null;
  to_value: string | null;
  description: string | null;
  performed_by: string | null;
  created_at: string;
}

export function useClientActions(clientId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ["client_actions", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase
        .from("client_actions")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ClientAction[];
    },
    enabled: !!clientId,
  });

  const createAction = useMutation({
    mutationFn: async (action: {
      client_id: string;
      action_type: string;
      from_value?: string;
      to_value?: string;
      description?: string;
    }) => {
      const { data: profile } = await supabase.auth.getUser();
      if (!profile.user) throw new Error("Usuário não autenticado");

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", profile.user.id)
        .single();

      if (!userProfile?.law_firm_id) throw new Error("Escritório não encontrado");

      const { data, error } = await supabase
        .from("client_actions")
        .insert({
          ...action,
          law_firm_id: userProfile.law_firm_id,
          performed_by: profile.user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client_actions"] });
    },
    onError: (error) => {
      toast({ title: "Erro ao registrar ação", description: error.message, variant: "destructive" });
    },
  });

  return {
    actions,
    isLoading,
    createAction,
  };
}
