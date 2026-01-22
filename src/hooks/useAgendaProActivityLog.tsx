import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/useLawFirm";

export interface ActivityLogEntry {
  id: string;
  appointment_id: string | null;
  user_id: string | null;
  action: string;
  details: Record<string, any> | null;
  created_at: string;
}

export function useAgendaProActivityLog(appointmentId?: string) {
  const { lawFirm } = useLawFirm();

  const { data: activityLog = [], isLoading, refetch } = useQuery({
    queryKey: ["agenda-pro-activity-log", lawFirm?.id, appointmentId],
    queryFn: async () => {
      if (!lawFirm?.id || !appointmentId) return [];

      const { data, error } = await supabase
        .from("agenda_pro_activity_log")
        .select("*")
        .eq("law_firm_id", lawFirm.id)
        .eq("appointment_id", appointmentId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ActivityLogEntry[];
    },
    enabled: !!lawFirm?.id && !!appointmentId,
  });

  return { activityLog, isLoading, refetch };
}

// Helper to log activity from frontend
export async function logAppointmentActivity(params: {
  lawFirmId: string;
  appointmentId: string;
  action: string;
  details?: Record<string, any>;
  userId?: string;
}) {
  const { lawFirmId, appointmentId, action, details, userId } = params;
  
  const { error } = await supabase
    .from("agenda_pro_activity_log")
    .insert({
      law_firm_id: lawFirmId,
      appointment_id: appointmentId,
      user_id: userId || null,
      action,
      details: details || null,
    });

  if (error) {
    console.error("[logAppointmentActivity] Error:", error);
  }
}
