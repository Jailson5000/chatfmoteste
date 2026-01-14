import { useState, useMemo } from "react";
import { format, startOfDay, endOfDay, addDays, subDays, isToday, isTomorrow, isPast, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Phone,
  CheckCircle,
  XCircle,
  AlertCircle,
  Filter,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppointments, Appointment } from "@/hooks/useAppointments";
import { cn } from "@/lib/utils";
import { AppointmentDetailsSheet } from "./AppointmentDetailsSheet";

const STATUS_CONFIG = {
  scheduled: { label: "Agendado", color: "bg-blue-500", icon: Clock },
  confirmed: { label: "Confirmado", color: "bg-green-500", icon: CheckCircle },
  completed: { label: "Concluído", color: "bg-gray-500", icon: CheckCircle },
  cancelled: { label: "Cancelado", color: "bg-red-500", icon: XCircle },
  no_show: { label: "Não compareceu", color: "bg-orange-500", icon: AlertCircle },
};

type PeriodFilter = "day" | "week" | "month" | "all";

export function AgendaAppointmentsList() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("day");
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Fetch all appointments when period is not "day", otherwise fetch by specific date
  const { appointments: allAppointments, isLoading } = useAppointments(
    periodFilter === "day" ? selectedDate : undefined
  );

  // Filter appointments by period
  const appointments = useMemo(() => {
    if (periodFilter === "day" || periodFilter === "all") {
      return allAppointments;
    }

    const now = selectedDate;
    let start: Date;
    let end: Date;

    if (periodFilter === "week") {
      start = startOfWeek(now, { weekStartsOn: 0 });
      end = endOfWeek(now, { weekStartsOn: 0 });
    } else if (periodFilter === "month") {
      start = startOfMonth(now);
      end = endOfMonth(now);
    } else {
      return allAppointments;
    }

    return allAppointments.filter((apt) => {
      const aptDate = parseISO(apt.start_time);
      return isWithinInterval(aptDate, { start, end });
    });
  }, [allAppointments, periodFilter, selectedDate]);

  const filteredAppointments =
    statusFilter === "all"
      ? appointments
      : appointments.filter((apt) => apt.status === statusFilter);

  // Sort by date when showing multiple days
  const sortedAppointments = useMemo(() => {
    return [...filteredAppointments].sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
  }, [filteredAppointments]);

  const handlePrevDay = () => setSelectedDate(subDays(selectedDate, 1));
  const handleNextDay = () => setSelectedDate(addDays(selectedDate, 1));
  const handleToday = () => setSelectedDate(new Date());

  const handlePrevPeriod = () => {
    if (periodFilter === "week") {
      setSelectedDate(subDays(selectedDate, 7));
    } else if (periodFilter === "month") {
      setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));
    } else {
      handlePrevDay();
    }
  };

  const handleNextPeriod = () => {
    if (periodFilter === "week") {
      setSelectedDate(addDays(selectedDate, 7));
    } else if (periodFilter === "month") {
      setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1));
    } else {
      handleNextDay();
    }
  };

  const getDateLabel = () => {
    if (periodFilter === "all") return "Todos os agendamentos";
    if (periodFilter === "month") {
      return format(selectedDate, "MMMM 'de' yyyy", { locale: ptBR });
    }
    if (periodFilter === "week") {
      const start = startOfWeek(selectedDate, { weekStartsOn: 0 });
      const end = endOfWeek(selectedDate, { weekStartsOn: 0 });
      return `${format(start, "d MMM", { locale: ptBR })} - ${format(end, "d MMM", { locale: ptBR })}`;
    }
    if (isToday(selectedDate)) return "Hoje";
    if (isTomorrow(selectedDate)) return "Amanhã";
    return format(selectedDate, "EEEE", { locale: ptBR });
  };

  const getDateSubLabel = () => {
    if (periodFilter === "all") return "";
    if (periodFilter === "month" || periodFilter === "week") return "";
    return format(selectedDate, "d 'de' MMMM, yyyy", { locale: ptBR });
  };

  return (
    <div className="space-y-6">
      {/* Header with date navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {periodFilter !== "all" && (
            <>
              <Button variant="outline" size="icon" onClick={handlePrevPeriod}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={handleToday}>
                Hoje
              </Button>
              <Button variant="outline" size="icon" onClick={handleNextPeriod}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
          <div className="ml-2">
            <p className="font-medium capitalize">{getDateLabel()}</p>
            {getDateSubLabel() && (
              <p className="text-sm text-muted-foreground">
                {getDateSubLabel()}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Dia</SelectItem>
                <SelectItem value="week">Semana</SelectItem>
                <SelectItem value="month">Mês</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filtrar status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="scheduled">Agendados</SelectItem>
                <SelectItem value="confirmed">Confirmados</SelectItem>
                <SelectItem value="completed">Concluídos</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
                <SelectItem value="no_show">Não compareceu</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
                <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{appointments.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-green-100 dark:bg-green-900">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {appointments.filter((a) => a.status === "confirmed").length}
                </p>
                <p className="text-xs text-muted-foreground">Confirmados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-yellow-100 dark:bg-yellow-900">
                <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {appointments.filter((a) => a.status === "scheduled").length}
                </p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-red-100 dark:bg-red-900">
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {appointments.filter((a) => a.status === "cancelled" || a.status === "no_show").length}
                </p>
                <p className="text-xs text-muted-foreground">Cancelados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Appointments List */}
      <Card>
        <CardHeader>
          <CardTitle>Agendamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : sortedAppointments.length > 0 ? (
            <div className="space-y-3">
              {sortedAppointments.map((apt) => {
                const StatusIcon = STATUS_CONFIG[apt.status].icon;
                const isPastAppointment = isPast(new Date(apt.end_time));
                const showDate = periodFilter !== "day";

                return (
                  <div
                    key={apt.id}
                    className={cn(
                      "flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors",
                      isPastAppointment && apt.status === "scheduled" && "opacity-60"
                    )}
                    onClick={() => setSelectedAppointment(apt)}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="w-1 h-14 rounded-full"
                        style={{ backgroundColor: apt.service?.color || "#6366f1" }}
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{apt.service?.name || "Serviço"}</p>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-xs text-white",
                              STATUS_CONFIG[apt.status].color
                            )}
                          >
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {STATUS_CONFIG[apt.status].label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                          {showDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(apt.start_time), "dd/MM", { locale: ptBR })}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(apt.start_time), "HH:mm")} -{" "}
                            {format(new Date(apt.end_time), "HH:mm")}
                          </span>
                          {apt.service?.duration_minutes && (
                            <span>{apt.service.duration_minutes}min</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="flex items-center gap-1 font-medium">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {apt.client_name || apt.client?.name || "Cliente"}
                      </div>
                      {(apt.client_phone || apt.client?.phone) && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {apt.client_phone || apt.client?.phone}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum agendamento encontrado</p>
              {statusFilter !== "all" && (
                <Button
                  variant="link"
                  onClick={() => setStatusFilter("all")}
                  className="mt-2"
                >
                  Limpar filtro
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AppointmentDetailsSheet
        appointment={selectedAppointment}
        onClose={() => setSelectedAppointment(null)}
      />
    </div>
  );
}
