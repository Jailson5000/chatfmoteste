import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "./useAdminAuth";

interface DatabaseMetrics {
  database_size_bytes: number;
  database_size_pretty: string;
  database_limit_bytes: number;
  database_limit_pretty: string;
  percent_used: number;
}

interface StorageBucket {
  bucket: string;
  size_bytes: number;
  size_pretty: string;
  file_count: number;
}

interface StorageMetrics {
  storage_size_bytes: number;
  storage_size_pretty: string;
  storage_limit_bytes: number;
  storage_limit_pretty: string;
  percent_used: number;
  buckets: StorageBucket[] | null;
}

interface AIUsageMetrics {
  current_month: {
    ai_conversations: number;
    tts_minutes: number;
  };
  last_month: {
    ai_conversations: number;
    tts_minutes: number;
  };
  total_companies: number;
  last_webhook_cleanup: string | null;
}

export type AlertStatus = "ok" | "warning" | "critical";

interface InfrastructureMetrics {
  database: DatabaseMetrics | null;
  storage: StorageMetrics | null;
  aiUsage: AIUsageMetrics | null;
  databaseStatus: AlertStatus;
  storageStatus: AlertStatus;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

function getAlertStatus(percentUsed: number): AlertStatus {
  if (percentUsed >= 85) return "critical";
  if (percentUsed >= 70) return "warning";
  return "ok";
}

export function useInfrastructureMetrics(): InfrastructureMetrics {
  const { user } = useAdminAuth();

  const { data: databaseData, isLoading: dbLoading, error: dbError, refetch: refetchDb } = useQuery({
    queryKey: ["infrastructure-database-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_database_metrics");
      if (error) throw error;
      const result = data as unknown as DatabaseMetrics | { error: string };
      if (result && typeof result === "object" && "error" in result) {
        throw new Error(result.error);
      }
      return result as DatabaseMetrics;
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    staleTime: 4 * 60 * 1000, // 4 minutes
  });

  const { data: storageData, isLoading: storageLoading, error: storageError, refetch: refetchStorage } = useQuery({
    queryKey: ["infrastructure-storage-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_storage_metrics");
      if (error) throw error;
      const result = data as unknown as StorageMetrics | { error: string };
      if (result && typeof result === "object" && "error" in result) {
        throw new Error(result.error);
      }
      return result as StorageMetrics;
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  const { data: aiUsageData, isLoading: aiLoading, error: aiError, refetch: refetchAI } = useQuery({
    queryKey: ["infrastructure-ai-usage"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_global_ai_usage");
      if (error) throw error;
      const result = data as unknown as AIUsageMetrics | { error: string };
      if (result && typeof result === "object" && "error" in result) {
        throw new Error(result.error);
      }
      return result as AIUsageMetrics;
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  const refetch = () => {
    refetchDb();
    refetchStorage();
    refetchAI();
  };

  return {
    database: databaseData ?? null,
    storage: storageData ?? null,
    aiUsage: aiUsageData ?? null,
    databaseStatus: databaseData ? getAlertStatus(databaseData.percent_used) : "ok",
    storageStatus: storageData ? getAlertStatus(storageData.percent_used) : "ok",
    isLoading: dbLoading || storageLoading || aiLoading,
    error: dbError || storageError || aiError || null,
    refetch,
  };
}
