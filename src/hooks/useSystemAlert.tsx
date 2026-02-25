import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SystemAlertData {
  enabled: boolean;
  message: string;
}

export function useSystemAlert() {
  const { data, isLoading } = useQuery({
    queryKey: ["system-alert"],
    queryFn: async (): Promise<SystemAlertData> => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["system_alert_enabled", "system_alert_message"]);

      if (error) throw error;

      const enabledSetting = data?.find((s) => s.key === "system_alert_enabled");
      const messageSetting = data?.find((s) => s.key === "system_alert_message");

      const enabled = enabledSetting?.value === "true" || enabledSetting?.value === true;
      const message = String(messageSetting?.value || "Sistema em atualização.").replace(/^"|"$/g, "");

      return { enabled, message };
    },
    refetchInterval: 43200000, // 12h - alerts almost never change
    staleTime: 10000,
  });

  return {
    alertEnabled: data?.enabled ?? false,
    alertMessage: data?.message ?? "",
    isLoading,
  };
}
