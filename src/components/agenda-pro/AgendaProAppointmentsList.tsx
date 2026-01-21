import { useState } from "react";
import { format, startOfDay, endOfDay, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAgendaProAppointments, AgendaProAppointment } from "@/hooks/useAgendaProAppointments";
import { AgendaProAppointmentSheet } from "./AgendaProAppointmentSheet";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Agendado", color: "bg-blue-500" },
  confirmed: { label: "Confirmado", color: "bg-green-500" },
  in_progress: { label: "Em Atendimento", color: "bg-yellow-500" },
  completed: { label: "Concluído", color: "bg-gray-500" },
  cancelled: { label: "Cancelado", color: "bg-red-500" },
  no_show: { label: "Não Compareceu", color: "bg-orange-500" },
  rescheduled: { label: "Reagendado", color: "bg-purple-500" },
};

export function AgendaProAppointmentsList() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAppointment, setSelectedAppointment] = useState<AgendaProAppointment | null>(null);

  const { appointments, isLoading } = useAgendaProAppointments({
    date: currentDate,
    view: "week",
  });

  // Filter appointments
  const filteredAppointments = appointments.filter((apt) => {
    if (statusFilter !== "all" && apt.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const clientName = (apt.client?.name || apt.client_name || "").toLowerCase();
      const serviceName = (apt.service?.name || "").toLowerCase();
      const professionalName = (apt.professional?.name || "").toLowerCase();
      if (!clientName.includes(query) && !serviceName.includes(query) && !professionalName.includes(query)) {
        return false;
      }
    }
    return true;
  });

  // Group by date
  const groupedAppointments = filteredAppointments.reduce((acc, apt) => {
    const dateKey = format(new Date(apt.start_time), "yyyy-MM-dd");
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(apt);
    return acc;
  }, {} as Record<string, AgendaProAppointment[]>);

  const sortedDates = Object.keys(groupedAppointments).sort();

  // Stats
  const stats = {
    total: appointments.length,
    confirmed: appointments.filter((a) => a.status === "confirmed").length,
    pending: appointments.filter((a) => a.status === "scheduled").length,
    cancelled: appointments.filter((a) => a.status === "cancelled").length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(addDays(currentDate, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Esta Semana
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(addDays(currentDate, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                <SelectItem key={value} value={value}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.confirmed}</div>
            <div className="text-xs text-muted-foreground">Confirmados</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">Pendentes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{stats.cancelled}</div>
            <div className="text-xs text-muted-foreground">Cancelados</div>
          </CardContent>
        </Card>
      </div>

      {/* Appointments List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : sortedDates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium">Nenhum agendamento encontrado</h3>
            <p className="text-sm text-muted-foreground">Não há agendamentos para o período selecionado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((dateKey) => (
            <div key={dateKey}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 capitalize">
                {format(new Date(dateKey), "EEEE, d 'de' MMMM", { locale: ptBR })}
              </h3>
              <div className="space-y-2">
                {groupedAppointments[dateKey].map((apt) => {
                  const status = STATUS_CONFIG[apt.status] || STATUS_CONFIG.scheduled;
                  return (
                    <Card
                      key={apt.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedAppointment(apt)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          {/* Time */}
                          <div className="text-center min-w-[60px]">
                            <div className="text-lg font-bold">
                              {format(new Date(apt.start_time), "HH:mm")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {apt.duration_minutes} min
                            </div>
                          </div>

                          {/* Color bar */}
                          <div
                            className="w-1 h-12 rounded-full"
                            style={{ backgroundColor: apt.professional?.color || apt.service?.color || "#6366f1" }}
                          />

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {apt.client?.name || apt.client_name || "Cliente"}
                            </div>
                            <div className="text-sm text-muted-foreground truncate">
                              {apt.service?.name} • {apt.professional?.name}
                            </div>
                          </div>

                          {/* Status */}
                          <Badge className={cn("text-white", status.color)}>
                            {status.label}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Appointment Sheet */}
      {selectedAppointment && (
        <AgendaProAppointmentSheet
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  );
}
