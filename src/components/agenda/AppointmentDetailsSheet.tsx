import { useState, useEffect } from "react";
import { format, addDays, startOfDay, addHours, isBefore } from "date-fns";
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
  Bell,
  Send,
  Edit2,
  X,
  Save,
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
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { useTenant } from "@/hooks/useTenant";
import { useLawFirm } from "@/hooks/useLawFirm";

interface ScheduledMessage {
  id: string;
  appointment_id: string;
  type: "reminder" | "confirmation" | "pre_message";
  scheduled_for: Date;
  message_preview: string;
  service_name: string;
  appointment_date: string;
  sent: boolean;
}

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
  const { tenant } = useTenant();
  const { lawFirm } = useLawFirm();
  const lawFirmId = tenant?.id;
  const [isUpdating, setIsUpdating] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date>(new Date());
  const [rescheduleSlot, setRescheduleSlot] = useState<TimeSlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  
  // Scheduled messages state
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(true);
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const [editedText, setEditedText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Fetch scheduled messages for this client (by phone)
  useEffect(() => {
    const fetchScheduledMessages = async () => {
      if (!appointment?.client_phone || !lawFirmId) return;
      
      setLoadingMessages(true);
      try {
        // Fetch all pending appointments for this client by phone
        const { data: clientAppointments, error } = await supabase
          .from("appointments")
          .select(`
            id,
            start_time,
            end_time,
            status,
            reminder_sent_at,
            confirmation_sent_at,
            pre_message_sent_at,
            service:services(
              id,
              name,
              pre_message_enabled,
              pre_message_text,
              pre_message_hours_before
            )
          `)
          .eq("law_firm_id", lawFirmId)
          .eq("client_phone", appointment.client_phone)
          .in("status", ["scheduled", "confirmed"])
          .gte("start_time", new Date().toISOString())
          .order("start_time", { ascending: true });

        if (error) throw error;

        const messages: ScheduledMessage[] = [];
        
        for (const apt of clientAppointments || []) {
          const aptDate = new Date(apt.start_time);
          const service = apt.service as any;
          
          // Default templates
          const defaultReminder = lawFirm?.reminder_message_template || 
            "Olá {nome}! Lembrando do seu agendamento amanhã às {horario} para {servico}.";
          const defaultConfirmation = lawFirm?.confirmation_message_template ||
            "Olá {nome}! Seu agendamento para {servico} está confirmado para hoje às {horario}.";
          
          // Check reminder (24h before)
          const reminderTime = addHours(aptDate, -24);
          if (!apt.reminder_sent_at && isBefore(new Date(), reminderTime)) {
            messages.push({
              id: `${apt.id}-reminder`,
              appointment_id: apt.id,
              type: "reminder",
              scheduled_for: reminderTime,
              message_preview: defaultReminder
                .replace("{nome}", appointment.client_name || "Cliente")
                .replace("{data}", format(aptDate, "dd/MM/yyyy"))
                .replace("{horario}", format(aptDate, "HH:mm"))
                .replace("{servico}", service?.name || "serviço")
                .replace("{empresa}", lawFirm?.name || ""),
              service_name: service?.name || "Serviço",
              appointment_date: format(aptDate, "dd/MM/yyyy HH:mm"),
              sent: false,
            });
          }
          
          // Check confirmation (2h before)
          const confirmationTime = addHours(aptDate, -2);
          if (!apt.confirmation_sent_at && isBefore(new Date(), confirmationTime)) {
            messages.push({
              id: `${apt.id}-confirmation`,
              appointment_id: apt.id,
              type: "confirmation",
              scheduled_for: confirmationTime,
              message_preview: defaultConfirmation
                .replace("{nome}", appointment.client_name || "Cliente")
                .replace("{data}", format(aptDate, "dd/MM/yyyy"))
                .replace("{horario}", format(aptDate, "HH:mm"))
                .replace("{servico}", service?.name || "serviço")
                .replace("{empresa}", lawFirm?.name || ""),
              service_name: service?.name || "Serviço",
              appointment_date: format(aptDate, "dd/MM/yyyy HH:mm"),
              sent: false,
            });
          }
          
          // Check pre-message (custom hours before)
          if (service?.pre_message_enabled && service?.pre_message_text) {
            const preMessageTime = addHours(aptDate, -(service.pre_message_hours_before || 48));
            if (!apt.pre_message_sent_at && isBefore(new Date(), preMessageTime)) {
              messages.push({
                id: `${apt.id}-pre_message`,
                appointment_id: apt.id,
                type: "pre_message",
                scheduled_for: preMessageTime,
                message_preview: service.pre_message_text
                  .replace("{nome}", appointment.client_name || "Cliente")
                  .replace("{data}", format(aptDate, "dd/MM/yyyy"))
                  .replace("{horario}", format(aptDate, "HH:mm"))
                  .replace("{servico}", service?.name || "serviço")
                  .replace("{empresa}", lawFirm?.name || ""),
                service_name: service?.name || "Serviço",
                appointment_date: format(aptDate, "dd/MM/yyyy HH:mm"),
                sent: false,
              });
            }
          }
        }
        
        // Sort by scheduled time
        messages.sort((a, b) => a.scheduled_for.getTime() - b.scheduled_for.getTime());
        setScheduledMessages(messages);
      } catch (err) {
        console.error("Error fetching scheduled messages:", err);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchScheduledMessages();
  }, [appointment?.client_phone, appointment?.client_name, lawFirmId, lawFirm]);

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
        // Reset message timestamps so they're re-sent at new times
        reminder_sent_at: null,
        confirmation_sent_at: null,
        pre_message_sent_at: null,
      } as any);

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

          {/* Scheduled Messages Section */}
          <Collapsible open={messagesOpen} onOpenChange={setMessagesOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2 hover:bg-muted/50 rounded-lg px-2 -mx-2">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Mensagens Agendadas</span>
                {scheduledMessages.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {scheduledMessages.length}
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {messagesOpen ? "▲" : "▼"}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                </div>
              ) : scheduledMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma mensagem agendada pendente
                </p>
              ) : (
                <ScrollArea className="max-h-[300px] pr-2">
                  <div className="space-y-3 pb-1">
                    {scheduledMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className="p-3 bg-muted/30 rounded-lg border space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                msg.type === "reminder" && "border-blue-500 text-blue-600",
                                msg.type === "confirmation" && "border-green-500 text-green-600",
                                msg.type === "pre_message" && "border-orange-500 text-orange-600"
                              )}
                            >
                              {msg.type === "reminder" && "Lembrete 24h"}
                              {msg.type === "confirmation" && "Confirmação 2h"}
                              {msg.type === "pre_message" && "Pré-mensagem"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {msg.service_name}
                            </span>
                          </div>
                          {editingMessage !== msg.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                setEditingMessage(msg.id);
                                setEditedText(msg.message_preview);
                              }}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>

                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Send className="h-3 w-3" />
                          <span>
                            Envio: {format(msg.scheduled_for, "dd/MM/yyyy 'às' HH:mm")}
                          </span>
                        </div>

                        {editingMessage === msg.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editedText}
                              onChange={(e) => setEditedText(e.target.value)}
                              className="text-xs min-h-[80px]"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-7 text-xs"
                                onClick={() => setEditingMessage(null)}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Cancelar
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 h-7 text-xs"
                                disabled={savingEdit}
                                onClick={async () => {
                                  setSavingEdit(true);
                                  try {
                                    // Update the template based on message type
                                    if (msg.type === "reminder") {
                                      await supabase
                                        .from("law_firms")
                                        .update({ reminder_message_template: editedText })
                                        .eq("id", lawFirmId);
                                    } else if (msg.type === "confirmation") {
                                      await supabase
                                        .from("law_firms")
                                        .update({ confirmation_message_template: editedText })
                                        .eq("id", lawFirmId);
                                    } else if (msg.type === "pre_message") {
                                      // Get service ID from appointment
                                      const aptId = msg.appointment_id;
                                      const { data: aptData } = await supabase
                                        .from("appointments")
                                        .select("service_id")
                                        .eq("id", aptId)
                                        .single();
                                      
                                      if (aptData?.service_id) {
                                        await supabase
                                          .from("services")
                                          .update({ pre_message_text: editedText })
                                          .eq("id", aptData.service_id);
                                      }
                                    }
                                    
                                    // Update local state
                                    setScheduledMessages(prev => 
                                      prev.map(m => 
                                        m.id === msg.id 
                                          ? { ...m, message_preview: editedText }
                                          : m
                                      )
                                    );
                                    
                                    toast({
                                      title: "Mensagem atualizada",
                                      description: "O template foi salvo com sucesso.",
                                    });
                                    setEditingMessage(null);
                                  } catch (err) {
                                    toast({
                                      title: "Erro ao salvar",
                                      description: "Não foi possível atualizar a mensagem.",
                                      variant: "destructive",
                                    });
                                  } finally {
                                    setSavingEdit(false);
                                  }
                                }}
                              >
                                <Save className="h-3 w-3 mr-1" />
                                {savingEdit ? "Salvando..." : "Salvar"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {msg.message_preview}
                          </p>
                        )}

                        <p className="text-xs text-muted-foreground">
                          Agendamento: {msg.appointment_date}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CollapsibleContent>
          </Collapsible>

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
