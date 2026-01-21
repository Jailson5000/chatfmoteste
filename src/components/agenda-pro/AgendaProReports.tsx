import { useState } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  Legend
} from "recharts";
import { 
  BarChart3, 
  Users, 
  Calendar, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAgendaProAppointments } from "@/hooks/useAgendaProAppointments";
import { useAgendaProClients } from "@/hooks/useAgendaProClients";
import { useAgendaProServices } from "@/hooks/useAgendaProServices";
import { useAgendaProProfessionals } from "@/hooks/useAgendaProProfessionals";

const STATUS_COLORS = {
  scheduled: "hsl(var(--primary))",
  confirmed: "#22c55e",
  completed: "#6b7280",
  cancelled: "#ef4444",
  no_show: "#f97316",
};

const CHART_COLORS = [
  "hsl(var(--primary))",
  "#22c55e",
  "#3b82f6",
  "#f97316",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

export function AgendaProReports() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  
  const { appointments } = useAgendaProAppointments({ 
    date: selectedMonth,
    view: "month" 
  });
  const { clients } = useAgendaProClients();
  const { services } = useAgendaProServices();
  const { professionals } = useAgendaProProfessionals();

  // Calculate metrics
  const totalAppointments = appointments.length;
  const completedAppointments = appointments.filter((a) => a.status === "completed").length;
  const confirmedAppointments = appointments.filter((a) => a.status === "confirmed").length;
  const cancelledAppointments = appointments.filter((a) => a.status === "cancelled").length;
  const noShowAppointments = appointments.filter((a) => a.status === "no_show").length;
  const scheduledAppointments = appointments.filter((a) => a.status === "scheduled").length;

  const noShowRate = totalAppointments > 0 ? ((noShowAppointments / totalAppointments) * 100).toFixed(1) : "0";
  const cancellationRate = totalAppointments > 0 ? ((cancelledAppointments / totalAppointments) * 100).toFixed(1) : "0";
  const completionRate = totalAppointments > 0 ? ((completedAppointments / totalAppointments) * 100).toFixed(1) : "0";
  const confirmationRate = totalAppointments > 0 ? (((completedAppointments + confirmedAppointments) / totalAppointments) * 100).toFixed(1) : "0";

  // Revenue calculation
  const totalRevenue = appointments
    .filter((a) => a.status === "completed")
    .reduce((sum, a) => sum + (a.price || 0), 0);

  // Status distribution for pie chart
  const statusData = [
    { name: "Agendados", value: scheduledAppointments, color: STATUS_COLORS.scheduled },
    { name: "Confirmados", value: confirmedAppointments, color: STATUS_COLORS.confirmed },
    { name: "Concluídos", value: completedAppointments, color: STATUS_COLORS.completed },
    { name: "Cancelados", value: cancelledAppointments, color: STATUS_COLORS.cancelled },
    { name: "Faltas", value: noShowAppointments, color: STATUS_COLORS.no_show },
  ].filter(s => s.value > 0);

  // Service statistics for bar chart
  const serviceStats = services
    .map((service) => {
      const serviceAppointments = appointments.filter((a) => a.service_id === service.id);
      return {
        name: service.name.length > 15 ? service.name.substring(0, 15) + "..." : service.name,
        fullName: service.name,
        count: serviceAppointments.length,
        completed: serviceAppointments.filter((a) => a.status === "completed").length,
        revenue: serviceAppointments.filter((a) => a.status === "completed").length * (service.price || 0),
      };
    })
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Professional statistics
  const professionalStats = professionals
    .map((prof) => {
      const profAppointments = appointments.filter((a) => a.professional_id === prof.id);
      const completed = profAppointments.filter((a) => a.status === "completed").length;
      const noShow = profAppointments.filter((a) => a.status === "no_show").length;
      return {
        name: prof.name.length > 12 ? prof.name.substring(0, 12) + "..." : prof.name,
        fullName: prof.name,
        total: profAppointments.length,
        completed,
        noShow,
        rate: profAppointments.length > 0 ? Math.round((completed / profAppointments.length) * 100) : 0,
      };
    })
    .filter(p => p.total > 0)
    .sort((a, b) => b.total - a.total);

  // Daily appointments for line chart
  const dailyData: { day: string; agendamentos: number; confirmados: number }[] = [];
  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  
  for (let i = 1; i <= monthEnd.getDate(); i++) {
    const dayAppointments = appointments.filter(a => {
      const date = new Date(a.start_time);
      return date.getDate() === i;
    });
    
    dailyData.push({
      day: String(i),
      agendamentos: dayAppointments.length,
      confirmados: dayAppointments.filter(a => 
        a.status === "confirmed" || a.status === "completed"
      ).length,
    });
  }

  const handlePrevMonth = () => {
    setSelectedMonth(subMonths(selectedMonth, 1));
  };

  const handleNextMonth = () => {
    const next = new Date(selectedMonth);
    next.setMonth(next.getMonth() + 1);
    if (next <= new Date()) {
      setSelectedMonth(next);
    }
  };

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Relatórios</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center font-medium">
            {format(selectedMonth, "MMMM yyyy", { locale: ptBR })}
          </span>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleNextMonth}
            disabled={selectedMonth.getMonth() === new Date().getMonth() && 
                     selectedMonth.getFullYear() === new Date().getFullYear()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{totalAppointments}</div>
                <div className="text-xs text-muted-foreground">Agendamentos</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{confirmationRate}%</div>
                <div className="text-xs text-muted-foreground">Confirmados</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <div className="text-2xl font-bold">{noShowRate}%</div>
                <div className="text-xs text-muted-foreground">Faltas</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{clients.length}</div>
                <div className="text-xs text-muted-foreground">Clientes</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-muted-foreground">Receita</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Daily appointments line chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agendamentos por Dia</CardTitle>
            <CardDescription>Evolução ao longo do mês</CardDescription>
          </CardHeader>
          <CardContent>
            {totalAppointments === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Nenhum agendamento neste período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="day" 
                    tick={{ fontSize: 12 }}
                    interval={4}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="agendamentos" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Total"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="confirmados" 
                    stroke="#22c55e" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Confirmados"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status distribution pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição por Status</CardTitle>
            <CardDescription>Como os agendamentos terminaram</CardDescription>
          </CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="60%" height={250}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {statusData.map((status) => (
                    <div key={status.name} className="flex items-center gap-2 text-sm">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: status.color }}
                      />
                      <span className="flex-1">{status.name}</span>
                      <span className="font-medium">{status.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Services bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Serviços Mais Agendados</CardTitle>
            <CardDescription>Ranking de serviços</CardDescription>
          </CardHeader>
          <CardContent>
            {serviceStats.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Nenhum agendamento ainda
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={serviceStats} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    tick={{ fontSize: 11 }}
                    width={100}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                    formatter={(value, name) => [value, name === "count" ? "Agendamentos" : "Concluídos"]}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="hsl(var(--primary))" 
                    radius={[0, 4, 4, 0]}
                    name="Total"
                  />
                  <Bar 
                    dataKey="completed" 
                    fill="#22c55e" 
                    radius={[0, 4, 4, 0]}
                    name="Concluídos"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Professionals performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Desempenho por Profissional</CardTitle>
            <CardDescription>Taxa de conclusão e faltas</CardDescription>
          </CardHeader>
          <CardContent>
            {professionalStats.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Nenhum profissional com agendamentos
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={professionalStats}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Legend />
                  <Bar 
                    dataKey="completed" 
                    fill="#22c55e" 
                    radius={[4, 4, 0, 0]}
                    name="Concluídos"
                  />
                  <Bar 
                    dataKey="noShow" 
                    fill="#f97316" 
                    radius={[4, 4, 0, 0]}
                    name="Faltas"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed tables */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top services table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalhes dos Serviços</CardTitle>
            <CardDescription>Receita por serviço</CardDescription>
          </CardHeader>
          <CardContent>
            {serviceStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum dado disponível
              </p>
            ) : (
              <div className="space-y-3">
                {serviceStats.map((service, index) => (
                  <div key={service.fullName} className="flex items-center gap-3">
                    <div className="w-6 text-center text-sm text-muted-foreground font-medium">
                      #{index + 1}
                    </div>
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{service.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {service.count} agendamentos • {service.completed} concluídos
                      </div>
                    </div>
                    {service.revenue > 0 && (
                      <div className="text-sm font-medium text-primary">
                        R$ {service.revenue.toLocaleString("pt-BR")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Professionals ranking table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranking de Profissionais</CardTitle>
            <CardDescription>Taxa de conclusão</CardDescription>
          </CardHeader>
          <CardContent>
            {professionalStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum dado disponível
              </p>
            ) : (
              <div className="space-y-3">
                {professionalStats.map((prof, index) => (
                  <div key={prof.fullName} className="flex items-center gap-3">
                    <div className="w-6 text-center text-sm text-muted-foreground font-medium">
                      #{index + 1}
                    </div>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium"
                      style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    >
                      {prof.fullName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{prof.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {prof.completed}/{prof.total} concluídos
                        {prof.noShow > 0 && ` • ${prof.noShow} faltas`}
                      </div>
                    </div>
                    <div className="text-sm font-medium">
                      <span className={prof.rate >= 70 ? "text-primary" : "text-destructive"}>
                        {prof.rate}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
