import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  History, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  UserCheck,
  Clock,
  RefreshCw,
  Bell,
  UserX,
  Loader2
} from "lucide-react";
import { useAgendaProActivityLog } from "@/hooks/useAgendaProActivityLog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AppointmentActivityLogProps {
  appointmentId: string;
}

const ACTION_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  created: { label: "Agendamento criado", icon: Plus, color: "text-blue-500" },
  confirmed: { label: "Confirmado pelo cliente", icon: CheckCircle2, color: "text-green-500" },
  confirmed_manual: { label: "Confirmado manualmente", icon: UserCheck, color: "text-green-500" },
  cancelled: { label: "Cancelado", icon: XCircle, color: "text-red-500" },
  rescheduled: { label: "Reagendado", icon: Calendar, color: "text-purple-500" },
  completed: { label: "Concluído", icon: CheckCircle2, color: "text-gray-500" },
  no_show: { label: "Não compareceu", icon: UserX, color: "text-orange-500" },
  reminder_sent: { label: "Lembrete enviado", icon: Bell, color: "text-blue-400" },
  updated: { label: "Atualizado", icon: RefreshCw, color: "text-yellow-500" },
  status_changed: { label: "Status alterado", icon: Clock, color: "text-indigo-500" },
};

export function AppointmentActivityLog({ appointmentId }: AppointmentActivityLogProps) {
  const { activityLog, isLoading } = useAgendaProActivityLog(appointmentId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activityLog.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        Nenhum histórico registrado
      </div>
    );
  }

  return (
    <ScrollArea className="h-[200px] pr-4">
      <div className="space-y-3">
        {activityLog.map((entry) => {
          const config = ACTION_CONFIG[entry.action] || {
            label: entry.action,
            icon: History,
            color: "text-muted-foreground",
          };
          const Icon = config.icon;

          return (
            <div key={entry.id} className="flex items-start gap-3">
              <div className={`mt-0.5 ${config.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{config.label}</p>
                {entry.details?.reason && (
                  <p className="text-xs text-muted-foreground">
                    Motivo: {entry.details.reason}
                  </p>
                )}
                {entry.details?.from && entry.details?.to && (
                  <p className="text-xs text-muted-foreground">
                    De {format(new Date(entry.details.from), "dd/MM HH:mm")} para{" "}
                    {format(new Date(entry.details.to), "dd/MM HH:mm")}
                  </p>
                )}
                {entry.details?.source && (
                  <p className="text-xs text-muted-foreground">
                    Via: {entry.details.source === "link" ? "Link de confirmação" : entry.details.source}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(entry.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
