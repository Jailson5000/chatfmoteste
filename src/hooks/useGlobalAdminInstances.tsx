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
  // Evolution connection info
  evolution_connection_id?: string;
  evolution_connection_name?: string;
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

export interface MatchedInstance {
  instance_name: string;
  db_id: string | null;
  company_name: string | null;
  law_firm_name: string | null;
  phone_number: string | null;
  status: string;
  is_orphan: boolean;
  is_stale: boolean;
}

export interface SyncResult {
  connection_id: string;
  connection_name: string;
  api_url: string;
  matched_instances: MatchedInstance[];
  total_evolution: number;
  total_db: number;
  orphan_count: number;
  stale_count: number;
}

export interface EvolutionConnection {
  id: string;
  name: string;
  api_url: string;
  is_active: boolean;
  is_default: boolean;
  health_status: string | null;
  health_latency_ms: number | null;
  last_health_check_at: string | null;
}

export function useGlobalAdminInstances() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch Evolution API connections
  const {
    data: evolutionConnections = [],
    isLoading: isConnectionsLoading,
  } = useQuery({
    queryKey: ["evolution-api-connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evolution_api_connections")
        .select("*")
        .order("is_default", { ascending: false });

      if (error) throw error;
      return data as EvolutionConnection[];
    },
  });

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

      // Fetch evolution connections for mapping
      const { data: evoConnections } = await supabase
        .from("evolution_api_connections")
        .select("id, name, api_url");

      // Helper to normalize URL for comparison - removes trailing slashes, /manager suffix, and lowercases
      const normalizeUrl = (url: string | null | undefined): string => {
        if (!url) return "";
        return url
          .trim()
          .replace(/\/+$/, "")  // Remove trailing slashes
          .replace(/\/manager$/i, "")  // Remove /manager suffix
          .toLowerCase();
      };

      // Map instances with company info
      const instancesWithCompany: InstanceWithCompany[] = (instancesData || []).map(
        (instance) => {
          const lawFirm = lawFirms?.find((lf) => lf.id === instance.law_firm_id);
          const company = companies?.find((c) => c.law_firm_id === instance.law_firm_id);
          
          // Find matching evolution connection by api_url
          const instanceUrlNormalized = normalizeUrl(instance.api_url);
          const evoConnection = evoConnections?.find((ec) => {
            const connectionUrlNormalized = normalizeUrl(ec.api_url);
            return connectionUrlNormalized === instanceUrlNormalized;
          });

          if (!evoConnection) {
            console.log("[useGlobalAdminInstances] No connection match for instance:", {
              instanceName: instance.instance_name,
              instanceUrl: instance.api_url,
              normalizedInstanceUrl: instanceUrlNormalized,
              availableConnections: evoConnections?.map(ec => ({ id: ec.id, url: ec.api_url, normalized: normalizeUrl(ec.api_url) }))
            });
          }

          return {
            ...instance,
            law_firm_name: lawFirm?.name || "Sem escritório",
            subdomain: lawFirm?.subdomain || null,
            company_name: company?.name || "Sem empresa",
            company_id: company?.id || null,
            evolution_connection_id: evoConnection?.id || null,
            evolution_connection_name: evoConnection?.name || "Conexão não identificada",
          };
        }
      );

      console.log("[useGlobalAdminInstances] Fetched:", instancesWithCompany.length, "instances");
      console.log("[useGlobalAdminInstances] By connection:", Object.keys(instancesWithCompany.reduce((acc, i) => { 
        acc[i.evolution_connection_id || "unknown"] = true; 
        return acc; 
      }, {} as Record<string, boolean>)));
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

  // Fetch phone number for a specific instance
  const fetchPhoneNumber = useMutation({
    mutationFn: async (instanceId: string) => {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "fetch_phone",
          instanceId,
        },
      });

      if (error) throw new Error(error.message);
      return data as { success: boolean; phone?: string; reason?: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["global-admin-instances"] });
      if (data.phone) {
        toast({
          title: "Número encontrado",
          description: `Número: ${data.phone}`,
        });
      } else {
        toast({
          title: "Número não encontrado",
          description: data.reason || "API não retornou o número",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao buscar número",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Sync instances from Evolution API
  const syncEvolutionInstances = useMutation({
    mutationFn: async (connectionId?: string) => {
      console.log("[useGlobalAdminInstances] Syncing Evolution instances...");
      const { data, error } = await supabase.functions.invoke("sync-evolution-instances", {
        body: connectionId ? { connectionId } : {},
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Failed to sync instances");

      return data as {
        success: boolean;
        message: string;
        results: SyncResult[];
        synced_at: string;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["global-admin-instances"] });
      queryClient.invalidateQueries({ queryKey: ["evolution-api-connections"] });
      refetchHealth();
      
      const totalOrphans = data.results.reduce((acc, r) => acc + r.orphan_count, 0);
      const totalStale = data.results.reduce((acc, r) => acc + r.stale_count, 0);
      
      let description = `${data.results.length} conexões sincronizadas`;
      if (totalOrphans > 0) {
        description += `. ${totalOrphans} instância(s) órfã(s) encontrada(s)`;
      }
      if (totalStale > 0) {
        description += `. ${totalStale} instância(s) obsoleta(s)`;
      }
      
      toast({
        title: "Sincronização concluída",
        description,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro na sincronização",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Group instances by Evolution connection
  const instancesByConnection = instances.reduce((acc, instance) => {
    const connectionId = instance.evolution_connection_id || "unknown";
    if (!acc[connectionId]) {
      acc[connectionId] = {
        connectionId,
        connectionName: instance.evolution_connection_name || "Conexão desconhecida",
        apiUrl: instance.api_url,
        instances: [],
      };
    }
    acc[connectionId].instances.push(instance);
    return acc;
  }, {} as Record<string, { connectionId: string; connectionName: string; apiUrl: string; instances: InstanceWithCompany[] }>);

  return {
    instances,
    instancesByConnection,
    evolutionConnections,
    isConnectionsLoading,
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
    syncEvolutionInstances,
    fetchPhoneNumber,
  };
}
