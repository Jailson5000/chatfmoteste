import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Clock,
  User,
  Phone,
  Mail,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Appointment, useAppointments } from "@/hooks/useAppointments";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface AppointmentDetailsSheetProps {
  appointment: Appointment | null;
  onClose: () => void;
}

const STATUS_CONFIG = {
  scheduled: { label: "Agendado", color: "bg-blue-500", variant: "secondary" as const },
  confirmed: { label: "Confirmado", color: "bg-green-500", variant: "default" as const },
  completed: { label: "Concluído", color: "bg-gray-500", variant: "secondary" as const },
  cancelled: { label: "Cancelado", color: "bg-red-500", variant: "destructive" as const },
  no_show: { label: "Não compareceu", color: "bg-orange-500", variant: "secondary" as const },
};

export function AppointmentDetailsSheet({
  appointment,
  onClose,
}: AppointmentDetailsSheetProps) {
  const { updateAppointment, cancelAppointment } = useAppointments();
  const [isUpdating, setIsUpdating] = useState(false);

  if (!appointment) return null;

  const statusConfig = STATUS_CONFIG[appointment.status];

  const handleConfirm = async () => {
    setIsUpdating(true);
    try {
      await updateAppointment.mutateAsync({
        id: appointment.id,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      });
      onClose();
    } finally {
      setIsUpdating(false);
    }
  };

  const handleComplete = async () => {
    setIsUpdating(true);
    try {
      await updateAppointment.mutateAsync({
        id: appointment.id,
        status: "completed",
      });
      onClose();
    } finally {
      setIsUpdating(false);
    }
  };

  const handleNoShow = async () => {
    setIsUpdating(true);
    try {
      await updateAppointment.mutateAsync({
        id: appointment.id,
        status: "no_show",
      });
      onClose();
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = async () => {
    setIsUpdating(true);
    try {
      await cancelAppointment.mutateAsync({
        id: appointment.id,
        reason: "Cancelado pelo administrador",
      });
      onClose();
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Sheet open={!!appointment} onOpenChange={() => onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: appointment.service?.color || "#6366f1" }}
            />
            {appointment.service?.name || "Agendamento"}
          </SheetTitle>
          <SheetDescription>
            Detalhes do agendamento
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={statusConfig.variant} className={cn("text-white", statusConfig.color)}>
              {statusConfig.label}
            </Badge>
          </div>

          <Separator />

          {/* Date and Time */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {format(new Date(appointment.start_time), "EEEE, d 'de' MMMM", { locale: ptBR })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(appointment.start_time), "yyyy")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {format(new Date(appointment.start_time), "HH:mm")} -{" "}
                  {format(new Date(appointment.end_time), "HH:mm")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {appointment.service?.duration_minutes} minutos
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Client Info */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Cliente</h4>

            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <span>{appointment.client_name || appointment.client?.name || "Não informado"}</span>
            </div>

            {(appointment.client_phone || appointment.client?.phone) && (
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <span>{appointment.client_phone || appointment.client?.phone}</span>
              </div>
            )}

            {appointment.client_email && (
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <span>{appointment.client_email}</span>
              </div>
            )}

            {appointment.notes && (
              <div className="flex items-start gap-3">
                <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
                <p className="text-sm">{appointment.notes}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Actions */}
          {appointment.status !== "cancelled" && appointment.status !== "completed" && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Ações</h4>

              <div className="grid grid-cols-2 gap-2">
                {appointment.status === "scheduled" && (
                  <Button
                    variant="outline"
                    className="text-green-600 hover:text-green-700"
                    onClick={handleConfirm}
                    disabled={isUpdating}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Confirmar
                  </Button>
                )}

                {(appointment.status === "scheduled" || appointment.status === "confirmed") && (
                  <>
                    <Button
                      variant="outline"
                      onClick={handleComplete}
                      disabled={isUpdating}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Concluir
                    </Button>

                    <Button
                      variant="outline"
                      className="text-orange-600 hover:text-orange-700"
                      onClick={handleNoShow}
                      disabled={isUpdating}
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Não compareceu
                    </Button>
                  </>
                )}

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={isUpdating}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancelar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita. O cliente será notificado sobre o
                        cancelamento.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Voltar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleCancel}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Confirmar Cancelamento
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              Criado em {format(new Date(appointment.created_at), "dd/MM/yyyy 'às' HH:mm")}
              {appointment.created_by === "ai" && " pela IA"}
              {appointment.created_by === "client" && " pelo cliente"}
              {appointment.created_by === "admin" && " pelo admin"}
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
