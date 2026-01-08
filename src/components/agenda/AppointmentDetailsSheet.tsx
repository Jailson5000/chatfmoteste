import { useState } from "react";
import { format, addDays, startOfDay } from "date-fns";
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
  RefreshCw,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Appointment, useAppointments, TimeSlot } from "@/hooks/useAppointments";
import { useServices } from "@/hooks/useServices";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
  const { updateAppointment, cancelAppointment, getAvailableSlots } = useAppointments();
  const { services } = useServices();
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date>(new Date());
  const [rescheduleSlot, setRescheduleSlot] = useState<TimeSlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);

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

  const handleOpenReschedule = () => {
    const service = appointment.service || services?.find((s) => s.id === appointment.service_id);
    if (service) {
      const tomorrow = addDays(startOfDay(new Date()), 1);
      setRescheduleDate(tomorrow);
      const slots = getAvailableSlots(tomorrow, service);
      setAvailableSlots(slots);
    }
    setRescheduleSlot(null);
    setShowReschedule(true);
  };

  const handleDateChange = (date: Date | undefined) => {
    if (!date) return;
    setRescheduleDate(date);
    setRescheduleSlot(null);
    const service = appointment.service || services?.find((s) => s.id === appointment.service_id);
    if (service) {
      const slots = getAvailableSlots(date, service);
      setAvailableSlots(slots);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleSlot) return;

    setIsUpdating(true);
    try {
      const service = appointment.service || services?.find((s) => s.id === appointment.service_id);
      const duration = service?.duration_minutes || 30;
      const bufferBefore = service?.buffer_before_minutes || 0;
      const bufferAfter = service?.buffer_after_minutes || 0;

      // Calculate actual start/end (slot includes buffers)
      const newStart = new Date(rescheduleSlot.start);
      newStart.setMinutes(newStart.getMinutes() + bufferBefore);
      const newEnd = new Date(newStart);
      newEnd.setMinutes(newEnd.getMinutes() + duration);

      await updateAppointment.mutateAsync({
        id: appointment.id,
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        status: "scheduled", // Reset to scheduled after reschedule
        confirmed_at: null,
      });

      // Send notification about reschedule
      if (appointment.client_phone) {
        supabase.functions.invoke("send-appointment-notification", {
          body: {
            appointment_id: appointment.id,
            type: "updated",
          },
        }).catch((err) => console.error("Failed to send reschedule notification:", err));
      }

      toast({
        title: "Agendamento reagendado",
        description: `Novo horário: ${format(newStart, "dd/MM/yyyy 'às' HH:mm")}`,
      });

      setShowReschedule(false);
      onClose();
    } catch (error: any) {
      toast({
        title: "Erro ao reagendar",
        description: error.message,
        variant: "destructive",
      });
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
                      className="text-blue-600 hover:text-blue-700"
                      onClick={handleOpenReschedule}
                      disabled={isUpdating}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reagendar
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

      {/* Reschedule Dialog */}
      <Dialog open={showReschedule} onOpenChange={setShowReschedule}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Reagendar Agendamento
            </DialogTitle>
            <DialogDescription>
              Selecione uma nova data e horário para {appointment.client_name || "o cliente"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Date picker */}
              <div className="flex-1">
                <p className="text-sm font-medium mb-2">Selecione a data</p>
                <CalendarPicker
                  mode="single"
                  selected={rescheduleDate}
                  onSelect={handleDateChange}
                  disabled={(date) => date < startOfDay(new Date())}
                  className="rounded-md border"
                />
              </div>

              {/* Time slots */}
              <div className="flex-1">
                <p className="text-sm font-medium mb-2">Horários disponíveis</p>
                <ScrollArea className="h-[280px] border rounded-md p-2">
                  {availableSlots.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {availableSlots
                        .filter((slot) => slot.available)
                        .map((slot, idx) => (
                          <Button
                            key={idx}
                            variant={rescheduleSlot?.start.getTime() === slot.start.getTime() ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                            onClick={() => setRescheduleSlot(slot)}
                          >
                            {format(slot.start, "HH:mm")}
                          </Button>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhum horário disponível nesta data
                    </p>
                  )}
                </ScrollArea>
              </div>
            </div>

            {rescheduleSlot && (
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-sm font-medium">Novo horário selecionado:</p>
                <p className="text-sm text-muted-foreground">
                  {format(rescheduleDate, "EEEE, d 'de' MMMM", { locale: ptBR })} às{" "}
                  {format(rescheduleSlot.start, "HH:mm")}
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowReschedule(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleReschedule}
              disabled={!rescheduleSlot || isUpdating}
            >
              {isUpdating ? "Salvando..." : "Confirmar Reagendamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
