import { useClientActions } from "@/hooks/useClientActions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowRightLeft, 
  MessageSquare, 
  Tag, 
  Folder, 
  User,
  Bot,
  Clock
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClientActionHistoryProps {
  clientId: string;
}

const actionIcons: Record<string, typeof ArrowRightLeft> = {
  transfer_handler: ArrowRightLeft,
  transfer_department: Folder,
  status_change: Tag,
  message_sent: MessageSquare,
  note_added: MessageSquare,
};

const actionLabels: Record<string, string> = {
  transfer_handler: "Transferência de atendente",
  transfer_department: "Transferência de departamento",
  status_change: "Alteração de status",
  message_sent: "Mensagem enviada",
  note_added: "Nota adicionada",
};

export function ClientActionHistory({ clientId }: ClientActionHistoryProps) {
  const { actions, isLoading } = useClientActions(clientId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Nenhuma ação registrada</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-3 pr-4">
        {actions.map((action) => {
          const Icon = actionIcons[action.action_type] || ArrowRightLeft;
          const label = actionLabels[action.action_type] || action.action_type;

          return (
            <div
              key={action.id}
              className="flex gap-3 p-3 rounded-lg border bg-muted/30"
            >
              <div className="p-2 rounded-full bg-primary/10 h-fit">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                {action.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {action.description}
                  </p>
                )}
                {action.from_value && action.to_value && (
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="px-2 py-0.5 rounded bg-muted">{action.from_value}</span>
                    <ArrowRightLeft className="h-3 w-3" />
                    <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">{action.to_value}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {format(new Date(action.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
