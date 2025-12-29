import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface InstanceWithCompany {
  id: string;
  instance_name: string;
  instance_id: string | null;
  api_url: string;
  status: string;
  phone_number: string | null;
  last_webhook_at: string | null;
  last_webhook_event: string | null;
  created_at: string;
  updated_at: string;
  law_firm_id: string;
  // Joined data
  law_firm_name?: string;
  company_name?: string;
  company_id?: string;
  subdomain?: string;
}

export interface EvolutionHealthStatus {
  status: "online" | "unstable" | "offline";
  latency_ms: number | null;
  message: string;
  checked_at: string;
  instances_summary?: {
    total: number;
    connected: number;
    disconnected: number;
    connecting: number;
    error: number;
  };
}

export function useGlobalAdminInstances() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all instances with company info
  const {
    data: instances = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["global-admin-instances"],
    queryFn: async () => {
      console.log("[useGlobalAdminInstances] Fetching all instances...");

      // Fetch instances
      const { data: instancesData, error: instancesError } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .order("created_at", { ascending: false });

      if (instancesError) {
        console.error("[useGlobalAdminInstances] Instances error:", instancesError);
        throw instancesError;
      }

      // Fetch law firms
      const { data: lawFirms } = await supabase
        .from("law_firms")
        .select("id, name, subdomain");

      // Fetch companies
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name, law_firm_id");

      // Map instances with company info
      const instancesWithCompany: InstanceWithCompany[] = (instancesData || []).map(
        (instance) => {
          const lawFirm = lawFirms?.find((lf) => lf.id === instance.law_firm_id);
          const company = companies?.find((c) => c.law_firm_id === instance.law_firm_id);

          return {
            ...instance,
            law_firm_name: lawFirm?.name || "Sem escritório",
            subdomain: lawFirm?.subdomain || null,
            company_name: company?.name || "Sem empresa",
            company_id: company?.id || null,
          };
        }
      );

      console.log("[useGlobalAdminInstances] Fetched:", instancesWithCompany.length);
      return instancesWithCompany;
    },
  });

  // Fetch Evolution API health
  const {
    data: evolutionHealth,
    isLoading: isHealthLoading,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ["evolution-health"],
    queryFn: async (): Promise<EvolutionHealthStatus> => {
      console.log("[useGlobalAdminInstances] Checking Evolution health...");

      const { data, error } = await supabase.functions.invoke("evolution-health");

      if (error) {
        console.error("[useGlobalAdminInstances] Health check error:", error);
        return {
          status: "offline",
          latency_ms: null,
          message: "Erro ao verificar status",
          checked_at: new Date().toISOString(),
        };
      }

      return data.health;
    },
    refetchInterval: 60000, // Refetch every minute
    staleTime: 30000,
  });

  // Force refresh instance status
  const refreshInstanceStatus = useMutation({
    mutationFn: async (instanceId: string) => {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "refresh_status",
          instanceId,
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Failed to refresh status");

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-admin-instances"] });
      toast({
        title: "Status atualizado",
        description: "O status da instância foi atualizado.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Restart instance connection
  const restartInstance = useMutation({
    mutationFn: async (instanceId: string) => {
      // Get QR code to restart connection
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "get_qrcode",
          instanceId,
        },
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["global-admin-instances"] });
      toast({
        title: data?.qrCode ? "Aguardando reconexão" : "Conexão reiniciada",
        description: data?.qrCode
          ? "A instância está aguardando escaneamento do QR Code"
          : "A instância foi reiniciada",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao reiniciar instância",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Suspend/disable instance (update status to disconnected)
  const suspendInstance = useMutation({
    mutationFn: async (instanceId: string) => {
      const { error } = await supabase
        .from("whatsapp_instances")
        .update({ status: "suspended", updated_at: new Date().toISOString() })
        .eq("id", instanceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-admin-instances"] });
      toast({
        title: "Instância suspensa",
        description: "A instância foi suspensa com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao suspender instância",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reactivate instance
  const reactivateInstance = useMutation({
    mutationFn: async (instanceId: string) => {
      const { error } = await supabase
        .from("whatsapp_instances")
        .update({ status: "disconnected", updated_at: new Date().toISOString() })
        .eq("id", instanceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-admin-instances"] });
      toast({
        title: "Instância reativada",
        description: "A instância foi reativada. O cliente pode reconectar.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao reativar instância",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Refresh all instances status
  const refreshAllStatuses = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        instances.map((instance) =>
          supabase.functions.invoke("evolution-api", {
            body: {
              action: "refresh_status",
              instanceId: instance.id,
            },
          })
        )
      );

      const successful = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      return { successful, failed, total: instances.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["global-admin-instances"] });
      refetchHealth();
      toast({
        title: "Status atualizados",
        description: `${data.successful} de ${data.total} instâncias atualizadas`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    instances,
    isLoading,
    error,
    refetch,
    evolutionHealth,
    isHealthLoading,
    refetchHealth,
    refreshInstanceStatus,
    restartInstance,
    suspendInstance,
    reactivateInstance,
    refreshAllStatuses,
  };
}
