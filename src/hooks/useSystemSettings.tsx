import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdminAuth } from "./useAdminAuth";
import { Json } from "@/integrations/supabase/types";

interface SystemSetting {
  id: string;
  key: string;
  value: Json;
  description: string | null;
  category: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useSystemSettings() {
  const { user } = useAdminAuth();
  const queryClient = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .order("category", { ascending: true });

      if (error) throw error;
      return data as SystemSetting[];
    },
  });

  const getSetting = (key: string) => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value;
  };

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: Json }) => {
      const { error } = await supabase
        .from("system_settings")
        .update({ value, updated_by: user?.id })
        .eq("key", key);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast.success("Configuração atualizada com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar configuração: " + error.message);
    },
  });

  const createSetting = useMutation({
    mutationFn: async (data: { key: string; value: Json; description?: string; category?: string }) => {
      const { error } = await supabase
        .from("system_settings")
        .insert({
          key: data.key,
          value: data.value,
          description: data.description,
          category: data.category,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast.success("Configuração criada com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao criar configuração: " + error.message);
    },
  });

  return {
    settings,
    isLoading,
    getSetting,
    updateSetting,
    createSetting,
  };
}
