import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TaskActivity {
  id: string;
  task_id: string;
  user_id: string | null;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  user: {
    id: string;
    full_name: string;
  } | null;
}

export function useTaskActivityLog(taskId: string | null) {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["task_activity_log", taskId],
    queryFn: async () => {
      if (!taskId) return [];

      const { data, error } = await supabase
        .from("task_activity_log")
        .select(`
          *,
          user:profiles(id, full_name)
        `)
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as TaskActivity[];
    },
    enabled: !!taskId,
  });

  return {
    activities,
    isLoading,
  };
}
