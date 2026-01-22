import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  Mail, 
  CheckCircle2, 
  XCircle, 
  UserX,
  MessageSquare,
  Loader2,
  History
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { AgendaProAppointment, useAgendaProAppointments } from "@/hooks/useAgendaProAppointments";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppointmentActivityLog } from "./AppointmentActivityLog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface AgendaProAppointmentSheetProps {
  appointment: AgendaProAppointment;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  scheduled: { label: "Agendado", color: "bg-blue-500", icon: Calendar },
  confirmed: { label: "Confirmado", color: "bg-green-500", icon: CheckCircle2 },
  in_progress: { label: "Em Atendimento", color: "bg-yellow-500", icon: Clock },
  completed: { label: "Concluído", color: "bg-gray-500", icon: CheckCircle2 },
  cancelled: { label: "Cancelado", color: "bg-red-500", icon: XCircle },
  no_show: { label: "Não Compareceu", color: "bg-orange-500", icon: UserX },
  rescheduled: { label: "Reagendado", color: "bg-purple-500", icon: Calendar },
};

export function AgendaProAppointmentSheet({ appointment, onClose }: AgendaProAppointmentSheetProps) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const { confirmAppointment, completeAppointment, cancelAppointment, markNoShow } = useAgendaProAppointments();

  const status = STATUS_CONFIG[appointment.status] || STATUS_CONFIG.scheduled;
  const StatusIcon = status.icon;

  const handleAction = async (action: "confirm" | "complete" | "no_show") => {
    setIsUpdating(true);
    try {
      switch (action) {
        case "confirm":
          await confirmAppointment.mutateAsync(appointment.id);
          break;
        case "complete":
          await completeAppointment.mutateAsync(appointment.id);
          break;
        case "no_show":
          await markNoShow.mutateAsync(appointment.id);
          break;
      }
      onClose();
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = async () => {
    setIsUpdating(true);
    try {
      await cancelAppointment.mutateAsync({ id: appointment.id, reason: cancelReason });
      setCancelDialogOpen(false);
      onClose();
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <Sheet open={true} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-[400px]">
          <SheetHeader className="pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle>Detalhes do Agendamento</SheetTitle>
              <Badge className={`${status.color} text-white`}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {status.label}
              </Badge>
            </div>
          </SheetHeader>

          <div className="space-y-6">
            {/* Service Info */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold" style={{ color: appointment.service?.color }}>
                {appointment.service?.name || "Serviço"}
              </h3>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(appointment.start_time), "EEEE, d 'de' MMMM", { locale: ptBR })}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {format(new Date(appointment.start_time), "HH:mm")} - {format(new Date(appointment.end_time), "HH:mm")}
                </div>
                <span>({appointment.duration_minutes} min)</span>
              </div>
            </div>

            <Separator />

            {/* Professional */}
            {appointment.professional && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Profissional</h4>
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                    style={{ backgroundColor: appointment.professional.color }}
                  >
                    {appointment.professional.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium">{appointment.professional.name}</div>
                  </div>
                </div>
              </div>
            )}

            <Separator />

            {/* Client Info */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Cliente</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{appointment.client?.name || appointment.client_name || "Não informado"}</span>
                </div>
                {(appointment.client?.phone || appointment.client_phone) && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{appointment.client?.phone || appointment.client_phone}</span>
                  </div>
                )}
                {appointment.client_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{appointment.client_email}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {appointment.notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Observações</h4>
                  <div className="flex items-start gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <p className="text-sm">{appointment.notes}</p>
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Actions */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Ações</h4>
              <div className="grid grid-cols-2 gap-2">
                {appointment.status === "scheduled" && (
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={() => handleAction("confirm")}
                    disabled={isUpdating}
                  >
                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Confirmar
                  </Button>
                )}
                
                {(appointment.status === "scheduled" || appointment.status === "confirmed") && (
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => handleAction("complete")}
                    disabled={isUpdating}
                  >
                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Concluir
                  </Button>
                )}

                {(appointment.status === "scheduled" || appointment.status === "confirmed") && (
                  <Button 
                    variant="outline"
                    className="w-full text-orange-600 hover:text-orange-700"
                    onClick={() => handleAction("no_show")}
                    disabled={isUpdating}
                  >
                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4 mr-2" />}
                    Faltou
                  </Button>
                )}

                {appointment.status !== "cancelled" && appointment.status !== "completed" && (
                  <Button 
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => setCancelDialogOpen(true)}
                    disabled={isUpdating}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Activity History */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                <History className="h-4 w-4" />
                Histórico de Alterações
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <AppointmentActivityLog appointmentId={appointment.id} />
              </CollapsibleContent>
            </Collapsible>

            {/* Metadata */}
            <div className="text-xs text-muted-foreground space-y-1 pt-4">
              <div>Criado em: {format(new Date(appointment.created_at), "dd/MM/yyyy 'às' HH:mm")}</div>
              {appointment.confirmed_at && (
                <div>Confirmado em: {format(new Date(appointment.confirmed_at), "dd/MM/yyyy 'às' HH:mm")}</div>
              )}
              {appointment.cancelled_at && (
                <div>Cancelado em: {format(new Date(appointment.cancelled_at), "dd/MM/yyyy 'às' HH:mm")}</div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Agendamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar este agendamento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Motivo do cancelamento (opcional)</label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Informe o motivo..."
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancel} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isUpdating}
            >
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar Cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
