import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AuditLog {
  id: string;
  user_id: string | null;
  admin_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface UseAuditLogsOptions {
  search?: string;
  action?: string;
  entityType?: string;
  page?: number;
  pageSize?: number;
}

export function useAuditLogs(options: UseAuditLogsOptions | number = {}) {
  // Support legacy usage with just a number (limit)
  const opts = typeof options === 'number' 
    ? { pageSize: options, page: 1 } 
    : options;
  
  const { search, action, entityType, page = 1, pageSize = 100 } = opts;

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["audit-logs", search, action, entityType, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (action) {
        query = query.eq("action", action);
      }

      if (entityType) {
        query = query.eq("entity_type", entityType);
      }

      if (search) {
        query = query.or(`action.ilike.%${search}%,entity_type.ilike.%${search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AuditLog[];
    },
  });

  return {
    logs,
    isLoading,
    refetch,
  };
}
