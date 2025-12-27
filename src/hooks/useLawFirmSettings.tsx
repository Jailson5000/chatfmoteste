import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLawFirm } from "./useLawFirm";

interface LawFirmSettings {
  id: string;
  law_firm_id: string;
  evolution_api_url: string | null;
  evolution_api_key: string | null;
  created_at: string;
  updated_at: string;
}

interface UpdateSettingsParams {
  evolution_api_url?: string;
  evolution_api_key?: string;
}

export function useLawFirmSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lawFirm } = useLawFirm();

  const {
    data: settings,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["law-firm-settings", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return null;

      const { data, error } = await supabase
        .from("law_firm_settings")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      if (error) {
        console.error("[useLawFirmSettings] Fetch error:", error);
        throw error;
      }

      return data as LawFirmSettings | null;
    },
    enabled: Boolean(lawFirm?.id),
  });

  const updateSettings = useMutation({
    mutationFn: async (params: UpdateSettingsParams) => {
      if (!lawFirm?.id) throw new Error("Law firm not found");

      // Check if settings exist
      const { data: existing } = await supabase
        .from("law_firm_settings")
        .select("id")
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from("law_firm_settings")
          .update({
            ...params,
            updated_at: new Date().toISOString(),
          })
          .eq("law_firm_id", lawFirm.id)
          .select()
          .single();

        if (error) throw error;
        return data as LawFirmSettings;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from("law_firm_settings")
          .insert({
            law_firm_id: lawFirm.id,
            ...params,
          })
          .select()
          .single();

        if (error) throw error;
        return data as LawFirmSettings;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["law-firm-settings"] });
      toast({
        title: "Configuração salva",
        description: "As configurações foram atualizadas com sucesso",
      });
    },
    onError: (error: Error) => {
      console.error("[useLawFirmSettings] Update error:", error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    settings,
    isLoading,
    error,
    refetch,
    updateSettings,
    // Computed values for easy access
    evolutionApiUrl: settings?.evolution_api_url || "",
    evolutionApiKey: settings?.evolution_api_key || "",
    isConfigured: Boolean(settings?.evolution_api_url && settings?.evolution_api_key),
  };
}
