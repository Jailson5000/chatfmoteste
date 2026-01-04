import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronDown, 
  ChevronUp, 
  ArrowRightLeft, 
  Tag, 
  Folder, 
  CircleDot,
  Bot,
  User,
  Clock
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ChatActivityLogProps {
  conversationId: string;
  clientId?: string;
}

interface ClientAction {
  id: string;
  action_type: string;
  from_value: string | null;
  to_value: string | null;
  description: string | null;
  performed_by: string | null;
  created_at: string;
  performer_profile?: { full_name: string } | null;
}

interface AITransferLog {
  id: string;
  from_agent_name: string | null;
  to_agent_name: string;
  transfer_type: string;
  reason: string | null;
  transferred_by_name: string | null;
  transferred_at: string;
}

interface ActivityItem {
  id: string;
  type: 'action' | 'transfer';
  icon: typeof ArrowRightLeft;
  title: string;
  description: string;
  performer: string;
  timestamp: Date;
}

const actionTypeConfig: Record<string, { icon: typeof ArrowRightLeft; label: string }> = {
  status_change: { icon: CircleDot, label: "alterou o status" },
  department_change: { icon: Folder, label: "transferiu para departamento" },
  tag_add: { icon: Tag, label: "adicionou a tag" },
  tag_remove: { icon: Tag, label: "removeu a tag" },
  transfer_handler: { icon: ArrowRightLeft, label: "transferiu o atendimento" },
};

export function ChatActivityLog({ conversationId, clientId }: ChatActivityLogProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch client actions
  const { data: clientActions = [] } = useQuery({
    queryKey: ["chat-activity-actions", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase
        .from("client_actions")
        .select(`
          id,
          action_type,
          from_value,
          to_value,
          description,
          performed_by,
          created_at,
          performer_profile:profiles!client_actions_performed_by_fkey(full_name)
        `)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("[ChatActivityLog] Error fetching client actions:", error);
        return [];
      }
      return data as ClientAction[];
    },
    enabled: !!clientId,
  });

  // Fetch AI transfer logs
  const { data: transferLogs = [] } = useQuery({
    queryKey: ["chat-activity-transfers", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_transfer_logs")
        .select("id, from_agent_name, to_agent_name, transfer_type, reason, transferred_by_name, transferred_at")
        .eq("conversation_id", conversationId)
        .order("transferred_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("[ChatActivityLog] Error fetching transfer logs:", error);
        return [];
      }
      return data as AITransferLog[];
    },
    enabled: !!conversationId,
  });

  // Combine and sort activities
  const activities: ActivityItem[] = [
    ...clientActions.map((action): ActivityItem => {
      const config = actionTypeConfig[action.action_type] || { icon: Clock, label: action.action_type };
      const performerName = (action.performer_profile as any)?.full_name || "Sistema";
      
      let description = action.description || "";
      if (!description && action.from_value && action.to_value) {
        description = `de ${action.from_value} para ${action.to_value}`;
      } else if (!description && action.to_value) {
        description = action.to_value;
      }

      return {
        id: action.id,
        type: 'action',
        icon: config.icon,
        title: config.label,
        description,
        performer: action.performed_by ? performerName : "IA",
        timestamp: new Date(action.created_at),
      };
    }),
    ...transferLogs.map((log): ActivityItem => {
      const isAITransfer = log.transfer_type === 'ai';
      const isHumanTransfer = log.transfer_type === 'human';
      
      return {
        id: log.id,
        type: 'transfer',
        icon: isAITransfer ? Bot : isHumanTransfer ? User : ArrowRightLeft,
        title: isAITransfer 
          ? `Transferido para IA: ${log.to_agent_name}`
          : isHumanTransfer 
            ? `Transferido para atendente: ${log.to_agent_name}`
            : `Transferido para: ${log.to_agent_name}`,
        description: log.reason || "",
        performer: log.transferred_by_name || (log.from_agent_name ? `IA: ${log.from_agent_name}` : "Sistema"),
        timestamp: new Date(log.transferred_at),
      };
    }),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (activities.length === 0) {
    return null;
  }

  const visibleActivities = isExpanded ? activities : activities.slice(0, 1);
  const remainingCount = activities.length - 1;

  return (
    <div className="w-full my-4 flex justify-center">
      <div className="max-w-[90%] w-full bg-muted/30 border border-border/50 rounded-lg p-3">
        {/* Activity items */}
        <div className="space-y-2">
          {visibleActivities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-2 text-sm">
              <activity.icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-primary font-medium">{activity.performer}</span>
                {" "}
                <span className="text-muted-foreground">{activity.title}</span>
                {activity.description && (
                  <>
                    {" "}
                    <span className="text-foreground font-medium">{activity.description}</span>
                  </>
                )}
                {" "}
                <span className="text-muted-foreground text-xs">
                  em {format(activity.timestamp, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Expand/Collapse button */}
        {remainingCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Mostrar menos
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Ver mais {remainingCount} {remainingCount === 1 ? "atividade" : "atividades"}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
