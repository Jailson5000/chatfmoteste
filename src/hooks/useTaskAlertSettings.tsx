import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useToast } from "@/hooks/use-toast";

export interface TaskAlertSettings {
  task_alert_enabled: boolean;
  task_alert_hours_before: number;
  task_alert_channels: string[];
  task_alert_business_hours_only: boolean;
}

export function useTaskAlertSettings() {
  const { lawFirm } = useLawFirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["task_alert_settings", lawFirm?.id],
    queryFn: async () => {
      if (!lawFirm?.id) return null;

      const { data, error } = await supabase
        .from("law_firm_settings")
        .select(
          "task_alert_enabled, task_alert_hours_before, task_alert_channels, task_alert_business_hours_only"
        )
        .eq("law_firm_id", lawFirm.id)
        .maybeSingle();

      if (error) throw error;

      return data as TaskAlertSettings | null;
    },
    enabled: !!lawFirm?.id,
  });

  const updateSettings = useMutation({
    mutationFn: async (input: TaskAlertSettings) => {
      if (!lawFirm?.id) throw new Error("Law firm not found");

      const { error } = await supabase
        .from("law_firm_settings")
        .update({
          task_alert_enabled: input.task_alert_enabled,
          task_alert_hours_before: input.task_alert_hours_before,
          task_alert_channels: input.task_alert_channels,
          task_alert_business_hours_only: input.task_alert_business_hours_only,
        })
        .eq("law_firm_id", lawFirm.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task_alert_settings"] });
      toast({ title: "Configurações salvas" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar configurações",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    settings,
    isLoading,
    updateSettings,
  };
}
