import { useState, useMemo } from "react";
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addWeeks, addMonths, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, List, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { useAgendaProAppointments, ViewType, AgendaProAppointment } from "@/hooks/useAgendaProAppointments";
import { useAgendaProProfessionals } from "@/hooks/useAgendaProProfessionals";
import { useAgendaPro } from "@/hooks/useAgendaPro";
import { cn } from "@/lib/utils";
import { AgendaProNewAppointmentDialog } from "./AgendaProNewAppointmentDialog";
import { AgendaProAppointmentSheet } from "./AgendaProAppointmentSheet";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-500",
  confirmed: "bg-green-500",
  in_progress: "bg-yellow-500",
  completed: "bg-gray-500",
  cancelled: "bg-red-500",
  no_show: "bg-orange-500",
  rescheduled: "bg-purple-500",
};

export function AgendaProCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>("day"); // Changed default to "day"
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>("all");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AgendaProAppointment | null>(null);
  const [miniCalendarMonth, setMiniCalendarMonth] = useState<Date>(new Date());

  const { appointments, isLoading } = useAgendaProAppointments({
    date: currentDate,
    view,
    professionalId: selectedProfessionalId === "all" ? undefined : selectedProfessionalId,
  });

  const { activeProfessionals } = useAgendaProProfessionals();
  const { settings } = useAgendaPro();

  // Working hours from settings
  const startHour = settings?.default_start_time ? parseInt(settings.default_start_time.split(':')[0]) : 7;
  const endHour = settings?.default_end_time ? parseInt(settings.default_end_time.split(':')[0]) : 19;

  // Get days with active appointments for mini calendar (exclude cancelled/no_show)
  const daysWithAppointments = useMemo(() => {
    return appointments.reduce((acc, apt) => {
      // Only count active appointments
      if (apt.status !== 'cancelled' && apt.status !== 'no_show') {
        const day = format(new Date(apt.start_time), 'yyyy-MM-dd');
        acc.add(day);
      }
      return acc;
    }, new Set<string>());
  }, [appointments]);

  // Handle mini calendar date select
  const handleMiniCalendarSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCurrentDate(date);
    }
  };

  // Navigation functions
  const navigate = (direction: "prev" | "next" | "today") => {
    if (direction === "today") {
      setCurrentDate(new Date());
      setSelectedDate(new Date());
      return;
    }
    
    const delta = direction === "prev" ? -1 : 1;
    switch (view) {
      case "day":
        setCurrentDate(addDays(currentDate, delta));
        break;
      case "week":
        setCurrentDate(addWeeks(currentDate, delta));
        break;
      case "month":
        setCurrentDate(addMonths(currentDate, delta));
        break;
    }
  };

  // Get appointments for a specific day (exclude cancelled/no_show for visual blocking)
  const getAppointmentsForDay = (date: Date, includeAll: boolean = false) => {
    return appointments.filter((apt) => {
      if (!isSameDay(new Date(apt.start_time), date)) return false;
      // For availability calculations, exclude cancelled and no_show
      if (!includeAll && (apt.status === 'cancelled' || apt.status === 'no_show')) return false;
      return true;
    });
  };

  // Get ALL appointments for a day (including cancelled for display purposes)
  const getAllAppointmentsForDay = (date: Date) => {
    return appointments.filter((apt) => isSameDay(new Date(apt.start_time), date));
  };

  // Week days for week view
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  // Month days for month view
  const monthDays = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const startWeek = startOfWeek(start, { weekStartsOn: 0 });
    const endWeek = addDays(startOfWeek(end, { weekStartsOn: 0 }), 6);
    return eachDayOfInterval({ start: startWeek, end: endWeek });
  }, [currentDate]);

  // Title based on view
  const getTitle = () => {
    switch (view) {
      case "day":
        return format(currentDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
      case "week":
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
        const weekEnd = addDays(weekStart, 6);
        return `${format(weekStart, "d MMM", { locale: ptBR })} - ${format(weekEnd, "d MMM yyyy", { locale: ptBR })}`;
      case "month":
        return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
    }
  };

  // Generate hours for day/week view with 30-minute intervals (display)
  // Note: Appointments can still be scheduled at 15-minute intervals (e.g., 12:15, 12:45)
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = startHour; h <= endHour; h++) {
      slots.push(`${String(h).padStart(2, "0")}:00`);
      if (h < endHour) {
        slots.push(`${String(h).padStart(2, "0")}:30`);
      }
    }
    return slots;
  }, [startHour, endHour]);

  // Check if a time slot is within working hours
  const isWithinWorkingHours = (hour: number) => {
    return hour >= startHour && hour < endHour;
  };

  // Helper to determine which 30-min slot an appointment belongs to
  const getSlotForTime = (date: Date): string => {
    const hour = date.getHours();
    const minute = date.getMinutes();
    const slotMinute = minute < 30 ? "00" : "30";
    return `${String(hour).padStart(2, "0")}:${slotMinute}`;
  };

  // Day view component - shows ALL appointments (including cancelled for visibility)
  const renderDayView = () => {
    const dayAppointments = getAllAppointmentsForDay(currentDate);

    return (
      <div className="border rounded-lg overflow-hidden">
        {timeSlots.map((slot) => {
          const [hourStr, minuteStr] = slot.split(':');
          const hour = parseInt(hourStr);
          const minute = parseInt(minuteStr);
          
          // Get appointments for this 30-min slot (can include 15-min appointments like 12:15, 12:45)
          const slotAppointments = dayAppointments.filter((apt) => {
            const aptDate = new Date(apt.start_time);
            return getSlotForTime(aptDate) === slot;
          });

          const isWorkingHour = isWithinWorkingHours(hour);

          return (
            <div 
              key={slot} 
              className={cn(
                "flex border-b last:border-b-0 min-h-[50px]",
                !isWorkingHour && "bg-muted/40"
              )}
            >
              <div className={cn(
                "w-16 flex-shrink-0 p-2 text-xs border-r",
                minute === 0 ? "text-muted-foreground font-medium" : "text-muted-foreground/60",
                !isWorkingHour && "bg-muted/50"
              )}>
                {slot}
              </div>
              <div className={cn(
                "flex-1 p-1 relative",
                !isWorkingHour && "bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,hsl(var(--muted)/0.4)_5px,hsl(var(--muted)/0.4)_10px)]"
              )}>
                {slotAppointments.map((apt) => {
                  const isCancelled = apt.status === 'cancelled' || apt.status === 'no_show';
                  return (
                    <button
                      key={apt.id}
                      onClick={() => setSelectedAppointment(apt)}
                      className={cn(
                        "w-full text-left p-2 rounded text-xs mb-1 text-white transition-transform hover:scale-[1.02] shadow-sm",
                        !isCancelled && apt.professional?.color ? "" : STATUS_COLORS[apt.status],
                        isCancelled && "opacity-60 line-through"
                      )}
                      style={{ backgroundColor: isCancelled ? undefined : (apt.professional?.color || undefined) }}
                    >
                      <div className="font-medium truncate">
                        {apt.client?.name || apt.client_name || "Cliente"}
                        {isCancelled && <span className="ml-1 no-underline">(Cancelado)</span>}
                      </div>
                      <div className="opacity-90 truncate">
                        {apt.service?.name} • {format(new Date(apt.start_time), "HH:mm")}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Week view component
  const renderWeekView = () => (
    <div className="grid grid-cols-7 gap-2">
      {weekDays.map((day) => {
        const dayAppointments = getAllAppointmentsForDay(day);
        const isSelected = isSameDay(day, selectedDate);
        const dayIsToday = isToday(day);

        return (
          <Card
            key={day.toISOString()}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md min-h-[200px]",
              isSelected && "ring-2 ring-primary",
              dayIsToday && "border-primary"
            )}
            onClick={() => setSelectedDate(day)}
          >
            <CardHeader className="p-2 pb-1">
              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-xs font-medium",
                  dayIsToday && "text-primary"
                )}>
                  {format(day, "EEE", { locale: ptBR })}
                </span>
                <span className={cn(
                  "text-lg font-bold",
                  dayIsToday && "bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center"
                )}>
                  {format(day, "d")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-2 pt-0 space-y-1">
              {dayAppointments.slice(0, 3).map((apt) => {
                const isCancelled = apt.status === 'cancelled' || apt.status === 'no_show';
                return (
                  <button
                    key={apt.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAppointment(apt);
                    }}
                    className={cn(
                      "w-full text-left p-1.5 rounded text-[10px] text-white transition-transform hover:scale-[1.02]",
                      isCancelled && "opacity-50 line-through"
                    )}
                    style={{ backgroundColor: isCancelled ? '#ef4444' : (apt.professional?.color || apt.service?.color || "#6366f1") }}
                  >
                    <div className="font-medium truncate">
                      {format(new Date(apt.start_time), "HH:mm")} {apt.client?.name || apt.client_name}
                    </div>
                  </button>
                );
              })}
              {dayAppointments.length > 3 && (
                <Badge variant="secondary" className="text-[10px] w-full justify-center">
                  +{dayAppointments.length - 3} mais
                </Badge>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  // Month view component
  const renderMonthView = () => (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 bg-muted/30">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
          <div key={day} className="p-2 text-center text-xs font-medium text-muted-foreground border-b">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {monthDays.map((day, index) => {
          const dayAppointments = getAllAppointmentsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const dayIsToday = isToday(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => {
                setSelectedDate(day);
                setView("day");
                setCurrentDate(day);
              }}
              className={cn(
                "min-h-[80px] p-1 border-b border-r text-left transition-colors hover:bg-muted/50",
                !isCurrentMonth && "bg-muted/20 text-muted-foreground",
                index % 7 === 6 && "border-r-0"
              )}
            >
              <div className={cn(
                "text-sm font-medium mb-1",
                dayIsToday && "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
              )}>
                {format(day, "d")}
              </div>
              {dayAppointments.slice(0, 2).map((apt) => {
                const isCancelled = apt.status === 'cancelled' || apt.status === 'no_show';
                return (
                  <div
                    key={apt.id}
                    className={cn(
                      "text-[10px] p-0.5 rounded mb-0.5 truncate text-white",
                      isCancelled && "opacity-50 line-through"
                    )}
                    style={{ backgroundColor: isCancelled ? '#ef4444' : (apt.professional?.color || apt.service?.color || "#6366f1") }}
                  >
                    {format(new Date(apt.start_time), "HH:mm")}
                  </div>
                );
              })}
              {dayAppointments.length > 2 && (
                <div className="text-[10px] text-muted-foreground">
                  +{dayAppointments.length - 2}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex gap-4">
      {/* Left Sidebar with Mini Calendar and Filters */}
      <div className="hidden lg:block w-72 flex-shrink-0 space-y-4">
        {/* Mini Calendar */}
        <Card className="p-2 overflow-hidden">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleMiniCalendarSelect}
            month={miniCalendarMonth}
            onMonthChange={setMiniCalendarMonth}
            locale={ptBR}
            className="pointer-events-auto w-full [&_table]:w-full"
            modifiers={{
              hasAppointment: (date) => daysWithAppointments.has(format(date, 'yyyy-MM-dd')),
            }}
            modifiersStyles={{
              hasAppointment: {
                fontWeight: 'bold',
                textDecoration: 'underline',
              },
            }}
            classNames={{
              months: "w-full",
              month: "w-full space-y-2",
              caption: "flex justify-center pt-1 relative items-center",
              caption_label: "text-sm font-medium",
              nav: "space-x-1 flex items-center",
              nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center",
              nav_button_previous: "absolute left-1",
              nav_button_next: "absolute right-1",
              table: "w-full border-collapse",
              head_row: "flex w-full justify-between",
              head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem] flex-1 text-center",
              row: "flex w-full mt-1 justify-between",
              cell: "flex-1 text-center text-sm relative p-0 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
              day: "h-8 w-8 p-0 font-normal aria-selected:opacity-100 mx-auto flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground",
              day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
              day_today: "bg-accent text-accent-foreground ring-1 ring-primary",
              day_outside: "text-muted-foreground opacity-50",
              day_disabled: "text-muted-foreground opacity-50",
              day_hidden: "invisible",
            }}
          />
        </Card>

        {/* Filters - Below mini calendar like reference image */}
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Filtros</h3>
            <Button 
              variant="link" 
              size="sm" 
              className="h-auto p-0 text-xs text-primary"
              onClick={() => setSelectedProfessionalId("all")}
            >
              Limpar filtros
            </Button>
          </div>
          
          <div className="space-y-4">
            {/* Status filter */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Status</label>
              <Select defaultValue="all">
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="scheduled">Agendado</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="in_progress">Em atendimento</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Professional filter */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Profissional</label>
              <Select value={selectedProfessionalId} onValueChange={setSelectedProfessionalId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {activeProfessionals.map((prof) => (
                    <SelectItem key={prof.id} value={prof.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: prof.color || '#6366f1' }} />
                        {prof.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Legend */}
        <Card className="p-4 space-y-2">
          <h3 className="font-semibold text-sm mb-3">Legenda</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-blue-500" />
              <span>Agendado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span>Confirmado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-yellow-500" />
              <span>Em atendimento</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gray-500" />
              <span>Concluído</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-500" />
              <span>Cancelado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border border-muted-foreground/30 bg-[repeating-linear-gradient(135deg,hsl(var(--muted)),hsl(var(--muted))_2px,transparent_2px,transparent_5px)]" />
              <span>Fora do expediente</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate("prev")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("today")}>
              Hoje
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigate("next")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold capitalize ml-2">{getTitle()}</h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile filter */}
            <div className="lg:hidden">
              <Select value={selectedProfessionalId} onValueChange={setSelectedProfessionalId}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Profissional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {activeProfessionals.map((prof) => (
                    <SelectItem key={prof.id} value={prof.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: prof.color }} />
                        {prof.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex rounded-md border">
              <Button
                variant={view === "day" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-r-none"
                onClick={() => setView("day")}
              >
                <CalendarDays className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "week" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none border-x"
                onClick={() => setView("week")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "month" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-l-none"
                onClick={() => setView("month")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>

            <Button onClick={() => setShowNewDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Agendamento</span>
            </Button>
          </div>
        </div>

        {/* Calendar View */}
        <div className="relative">
          {isLoading && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          )}
          
          {view === "day" && renderDayView()}
          {view === "week" && renderWeekView()}
          {view === "month" && renderMonthView()}
        </div>
      </div>

      {/* Dialogs */}
      <AgendaProNewAppointmentDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        defaultDate={selectedDate}
      />

      {selectedAppointment && (
        <AgendaProAppointmentSheet
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  );
}
