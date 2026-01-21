import { BarChart3, Users, Calendar, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAgendaProAppointments } from "@/hooks/useAgendaProAppointments";
import { useAgendaProClients } from "@/hooks/useAgendaProClients";
import { useAgendaProServices } from "@/hooks/useAgendaProServices";
import { useAgendaProProfessionals } from "@/hooks/useAgendaProProfessionals";

export function AgendaProReports() {
  const { appointments } = useAgendaProAppointments({ view: "month" });
  const { clients } = useAgendaProClients();
  const { services } = useAgendaProServices();
  const { professionals } = useAgendaProProfessionals();

  // Calculate metrics
  const totalAppointments = appointments.length;
  const completedAppointments = appointments.filter((a) => a.status === "completed").length;
  const cancelledAppointments = appointments.filter((a) => a.status === "cancelled").length;
  const noShowAppointments = appointments.filter((a) => a.status === "no_show").length;

  const noShowRate = totalAppointments > 0 ? ((noShowAppointments / totalAppointments) * 100).toFixed(1) : "0";
  const cancellationRate = totalAppointments > 0 ? ((cancelledAppointments / totalAppointments) * 100).toFixed(1) : "0";
  const completionRate = totalAppointments > 0 ? ((completedAppointments / totalAppointments) * 100).toFixed(1) : "0";

  // Service statistics
  const serviceStats = services.map((service) => {
    const serviceAppointments = appointments.filter((a) => a.service_id === service.id);
    return {
      name: service.name,
      color: service.color,
      count: serviceAppointments.length,
      revenue: serviceAppointments.filter((a) => a.status === "completed").length * (service.price || 0),
    };
  }).sort((a, b) => b.count - a.count);

  // Professional statistics
  const professionalStats = professionals.map((prof) => {
    const profAppointments = appointments.filter((a) => a.professional_id === prof.id);
    const completed = profAppointments.filter((a) => a.status === "completed").length;
    return {
      name: prof.name,
      color: prof.color,
      total: profAppointments.length,
      completed,
      rate: profAppointments.length > 0 ? ((completed / profAppointments.length) * 100).toFixed(0) : "0",
    };
  }).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <div className="p-2 rounded-lg bg-green-500/10">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{completionRate}%</div>
                <div className="text-xs text-muted-foreground">Taxa de Conclusão</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <TrendingDown className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{noShowRate}%</div>
                <div className="text-xs text-muted-foreground">Taxa de Faltas</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{clients.length}</div>
                <div className="text-xs text-muted-foreground">Clientes</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Services Ranking */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Serviços Mais Agendados</CardTitle>
            <CardDescription>Este mês</CardDescription>
          </CardHeader>
          <CardContent>
            {serviceStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum agendamento ainda
              </p>
            ) : (
              <div className="space-y-3">
                {serviceStats.slice(0, 5).map((service, index) => (
                  <div key={service.name} className="flex items-center gap-3">
                    <div className="w-6 text-center text-sm text-muted-foreground">
                      #{index + 1}
                    </div>
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: service.color }}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{service.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {service.count} agendamento{service.count !== 1 ? "s" : ""}
                      </div>
                    </div>
                    {service.revenue > 0 && (
                      <div className="text-sm font-medium text-green-600">
                        R$ {service.revenue.toFixed(0)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Professionals Ranking */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profissionais</CardTitle>
            <CardDescription>Desempenho este mês</CardDescription>
          </CardHeader>
          <CardContent>
            {professionalStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum profissional cadastrado
              </p>
            ) : (
              <div className="space-y-3">
                {professionalStats.slice(0, 5).map((prof, index) => (
                  <div key={prof.name} className="flex items-center gap-3">
                    <div className="w-6 text-center text-sm text-muted-foreground">
                      #{index + 1}
                    </div>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
                      style={{ backgroundColor: prof.color }}
                    >
                      {prof.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{prof.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {prof.completed}/{prof.total} concluídos
                      </div>
                    </div>
                    <div className="text-sm font-medium">
                      {prof.rate}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo por Status</CardTitle>
          <CardDescription>Distribuição dos agendamentos deste mês</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Agendados", value: appointments.filter((a) => a.status === "scheduled").length, color: "bg-blue-500" },
              { label: "Confirmados", value: appointments.filter((a) => a.status === "confirmed").length, color: "bg-green-500" },
              { label: "Concluídos", value: completedAppointments, color: "bg-gray-500" },
              { label: "Cancelados", value: cancelledAppointments, color: "bg-red-500" },
              { label: "Faltas", value: noShowAppointments, color: "bg-orange-500" },
            ].map((item) => (
              <div key={item.label} className="text-center p-3 rounded-lg bg-muted/50">
                <div className={`w-3 h-3 rounded-full ${item.color} mx-auto mb-2`} />
                <div className="text-xl font-bold">{item.value}</div>
                <div className="text-xs text-muted-foreground">{item.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
