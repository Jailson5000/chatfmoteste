import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NotificationLog {
  id: string;
  event_type: string;
  tenant_id: string | null;
  company_name: string | null;
  event_key: string;
  metadata: Record<string, any>;
  sent_at: string;
  email_sent_to: string;
  created_at: string;
}

export function useNotificationLogs(limit: number = 50) {
  return useQuery({
    queryKey: ['admin-notification-logs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_notification_logs')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return (data || []) as NotificationLog[];
    },
  });
}

export function useNotificationStats() {
  return useQuery({
    queryKey: ['admin-notification-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_notification_logs')
        .select('event_type, sent_at');
      
      if (error) throw error;
      
      const logs = data || [];
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      return {
        total: logs.length,
        last24h: logs.filter(l => new Date(l.sent_at) >= last24h).length,
        last7d: logs.filter(l => new Date(l.sent_at) >= last7d).length,
        byType: {
          success: logs.filter(l => l.event_type === 'COMPANY_PROVISIONING_SUCCESS').length,
          failed: logs.filter(l => l.event_type === 'COMPANY_PROVISIONING_FAILED').length,
          partial: logs.filter(l => l.event_type === 'COMPANY_PROVISIONING_PARTIAL').length,
          integrationDown: logs.filter(l => l.event_type === 'INTEGRATION_DOWN').length,
          instanceDisconnected: logs.filter(l => 
            l.event_type === 'INSTANCE_DISCONNECTION_ALERT' || 
            l.event_type === 'INSTANCE_DISCONNECTION_REMINDER'
          ).length,
        },
      };
    },
  });
}
