import { useState, useEffect, useRef } from "react";
import { format, addDays, subDays, startOfWeek, addWeeks, subWeeks, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAppointments, Appointment } from "@/hooks/useAppointments";
import { useServices } from "@/hooks/useServices";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { cn } from "@/lib/utils";
import { NewAppointmentDialog } from "./NewAppointmentDialog";
import { AppointmentDetailsSheet } from "./AppointmentDetailsSheet";

export function AgendaCalendar() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const hasSyncedRef = useRef(false);

  const { appointments, isLoading } = useAppointments(selectedDate);
  const { services } = useServices();
  const { integration, syncNow } = useGoogleCalendar();

  // Auto-sync Google Calendar on mount (once)
  useEffect(() => {
    if (integration?.is_active && !hasSyncedRef.current && !syncNow.isPending) {
      hasSyncedRef.current = true;
      syncNow.mutate();
    }
  }, [integration?.is_active]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Filter out cancelled appointments for calendar view
  const activeAppointments = appointments.filter((apt) => apt.status !== "cancelled");

  const getAppointmentsForDay = (date: Date) => {
    return activeAppointments.filter((apt) => isSameDay(new Date(apt.start_time), date));
  };

  const handlePrevWeek = () => setWeekStart(subWeeks(weekStart, 1));
  const handleNextWeek = () => setWeekStart(addWeeks(weekStart, 1));
  const handleToday = () => {
    const today = new Date();
    setWeekStart(startOfWeek(today, { weekStartsOn: 1 }));
    setSelectedDate(today);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-500";
      case "scheduled":
        return "bg-blue-500";
      case "completed":
        return "bg-gray-500";
      case "no_show":
        return "bg-red-500";
      default:
        return "bg-gray-400";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleToday}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 font-medium">
            {format(weekStart, "MMMM yyyy", { locale: ptBR })}
          </span>
        </div>

        <Button onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Agendamento
        </Button>
      </div>

      {/* Week View */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const dayAppointments = getAppointmentsForDay(day);
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());

          return (
            <Card
              key={day.toISOString()}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md min-h-[120px]",
                isSelected && "ring-2 ring-primary",
                isToday && "bg-primary/5"
              )}
              onClick={() => setSelectedDate(day)}
            >
              <CardHeader className="p-2 pb-1">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase">
                    {format(day, "EEE", { locale: ptBR })}
                  </p>
                  <p
                    className={cn(
                      "text-lg font-bold",
                      isToday && "text-primary"
                    )}
                  >
                    {format(day, "d")}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-2 pt-0">
                {dayAppointments.length > 0 ? (
                  <div className="space-y-1">
                    {dayAppointments.slice(0, 3).map((apt) => (
                      <div
                        key={apt.id}
                        className={cn(
                          "text-xs p-1 rounded truncate text-white",
                          getStatusColor(apt.status)
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAppointment(apt);
                        }}
                      >
                        {format(new Date(apt.start_time), "HH:mm")} - {apt.service?.name || "Serviço"}
                      </div>
                    ))}
                    {dayAppointments.length > 3 && (
                      <p className="text-xs text-muted-foreground text-center">
                        +{dayAppointments.length - 3} mais
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center">
                    Sem agendamentos
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Selected Day Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : activeAppointments.length > 0 ? (
            <div className="space-y-3">
              {activeAppointments.map((apt) => (
                <div
                  key={apt.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedAppointment(apt)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-1 h-12 rounded-full",
                        apt.service?.color ? `bg-[${apt.service.color}]` : "bg-primary"
                      )}
                      style={{ backgroundColor: apt.service?.color }}
                    />
                    <div>
                      <p className="font-medium">{apt.service?.name || "Serviço"}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(apt.start_time), "HH:mm")} - {format(new Date(apt.end_time), "HH:mm")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{apt.client_name || apt.client?.name || "Cliente"}</p>
                    <Badge
                      variant={apt.status === "confirmed" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {apt.status === "scheduled" && "Agendado"}
                      {apt.status === "confirmed" && "Confirmado"}
                      {apt.status === "completed" && "Concluído"}
                      {apt.status === "no_show" && "Não compareceu"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum agendamento para este dia</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setShowNewDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar Agendamento
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <NewAppointmentDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        defaultDate={selectedDate}
      />

      <AppointmentDetailsSheet
        appointment={selectedAppointment}
        onClose={() => setSelectedAppointment(null)}
      />
    </div>
  );
}
