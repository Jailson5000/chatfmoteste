import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useMaintenanceMode() {
  const { data, isLoading } = useQuery({
    queryKey: ["maintenance-mode"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "maintenance_mode")
        .maybeSingle();

      if (error) throw error;
      const val = data?.value;
      return val === true || val === "true";
    },
    refetchInterval: 43200000, // 12h - data almost never changes
    staleTime: 10000,
  });

  return {
    isMaintenanceMode: data ?? false,
    isLoading,
  };
}
