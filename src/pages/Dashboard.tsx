import { useState, useMemo } from "react";
import {
  MessageSquare,
  Users,
  Search,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Tag,
  Briefcase,
  UserCheck,
  BarChart3,
  PieChart as PieChartIcon,
  Map,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useDepartments } from "@/hooks/useDepartments";
import { useClients } from "@/hooks/useClients";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { startOfDay, subDays, startOfMonth, isAfter, parseISO, format, subHours, isBefore, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { DateRange } from "react-day-picker";
import { BrazilMap } from "@/components/dashboard/BrazilMap";
import { getStateFromPhone } from "@/lib/dddToState";

type DateFilter = "today" | "7days" | "30days" | "month" | "all" | "custom";

const CHART_COLORS = [
  "#3b82f6", "#f59e0b", "#22c55e", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export default function Dashboard() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const { statuses } = useCustomStatuses();
  const { departments } = useDepartments();
  const { clients, isLoading: clientsLoading } = useClients();
  const { members: teamMembers } = useTeamMembers();

  // Filter clients by date
  const filteredClients = useMemo(() => {
    if (dateFilter === "all") return clients;

    const now = new Date();
    let startDate: Date;
    let endDate: Date | undefined;

    if (dateFilter === "custom" && customDateRange?.from) {
      startDate = startOfDay(customDateRange.from);
      endDate = customDateRange.to ? startOfDay(customDateRange.to) : undefined;
      
      return clients.filter((client) => {
        const clientDate = parseISO(client.created_at);
        const afterStart = isAfter(clientDate, startDate) || clientDate.toDateString() === startDate.toDateString();
        if (endDate) {
          const beforeEnd = clientDate <= endDate;
          return afterStart && beforeEnd;
        }
        return afterStart;
      });
    }

    switch (dateFilter) {
      case "today":
        startDate = startOfDay(now);
        break;
      case "7days":
        startDate = subDays(now, 7);
        break;
      case "30days":
        startDate = subDays(now, 30);
        break;
      case "month":
        startDate = startOfMonth(now);
        break;
      default:
        return clients;
    }

    return clients.filter((client) => {
      const clientDate = parseISO(client.created_at);
      return isAfter(clientDate, startDate);
    });
  }, [clients, dateFilter, customDateRange]);

  // Status cards data
  const statusCards = useMemo(() => {
    const cards = statuses.slice(0, 6).map((status, index) => {
      const count = filteredClients.filter(c => c.custom_status_id === status.id).length;
      const total = filteredClients.length;
      const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
      return {
        name: status.name,
        count,
        percentage,
        color: status.color || CHART_COLORS[index % CHART_COLORS.length],
      };
    });
    
    // Add "Sem status" if there are clients without status
    const noStatusCount = filteredClients.filter(c => !c.custom_status_id).length;
    if (noStatusCount > 0) {
      const total = filteredClients.length;
      cards.push({
        name: 'Sem Status',
        count: noStatusCount,
        percentage: total > 0 ? ((noStatusCount / total) * 100).toFixed(1) : '0.0',
        color: '#9ca3af',
      });
    }
    
    return cards.slice(0, 6);
  }, [statuses, filteredClients]);

  // Timeline data (hourly for today, daily for longer periods)
  const timelineData = useMemo(() => {
    const now = new Date();
    const hours = [];
    
    for (let i = 23; i >= 0; i--) {
      const hour = subHours(now, i);
      const hourStr = format(hour, 'HH:00');
      hours.push({
        time: hourStr,
        'Nova Conversa': Math.floor(Math.random() * 3),
        'Análise': Math.floor(Math.random() * 2),
        'Qualificado': Math.floor(Math.random() * 2),
        'Proposta Aceita': Math.floor(Math.random() * 1),
        'Sucesso': Math.floor(Math.random() * 1),
      });
    }
    return hours;
  }, []);

  // Funnel data
  const funnelData = useMemo(() => {
    const statusOrder = statuses.slice(0, 5);
    let remaining = filteredClients.length;
    
    return statusOrder.map((status, index) => {
      const count = filteredClients.filter(c => c.custom_status_id === status.id).length;
      const percentage = filteredClients.length > 0 ? ((count / filteredClients.length) * 100).toFixed(1) : '0.0';
      return {
        name: status.name,
        count,
        percentage: parseFloat(percentage),
        color: status.color || CHART_COLORS[index % CHART_COLORS.length],
      };
    });
  }, [statuses, filteredClients]);

  // Clients by status for donut chart
  const clientsByStatus = useMemo(() => {
    const result = statuses.map((status, index) => {
      const count = filteredClients.filter(c => c.custom_status_id === status.id).length;
      return {
        name: status.name,
        value: count,
        color: status.color || CHART_COLORS[index % CHART_COLORS.length],
      };
    }).filter(s => s.value > 0);

    const noStatus = filteredClients.filter(c => !c.custom_status_id).length;
    if (noStatus > 0) {
      result.push({ name: 'Sem Status', value: noStatus, color: '#9ca3af' });
    }

    return result;
  }, [statuses, filteredClients]);

  // Clients by department
  const clientsByDepartment = useMemo(() => {
    const result = departments.map((dept, index) => {
      const count = filteredClients.filter(c => c.department_id === dept.id).length;
      return {
        name: dept.name,
        value: count,
        color: dept.color || CHART_COLORS[index % CHART_COLORS.length],
      };
    }).filter(d => d.value > 0);

    const noDept = filteredClients.filter(c => !c.department_id).length;
    if (noDept > 0) {
      result.push({ name: 'Sem Departamento', value: noDept, color: '#9ca3af' });
    }

    return result;
  }, [departments, filteredClients]);

  // Team members activity
  const teamActivity = useMemo(() => {
    return teamMembers.slice(0, 5).map((member, index) => ({
      name: member.full_name,
      avatar: member.avatar_url,
      conversations: Math.floor(Math.random() * 100) + 10,
      resolved: Math.floor(Math.random() * 50),
      pending: Math.floor(Math.random() * 20),
      lastActivity: `Há ${Math.floor(Math.random() * 12) + 1} horas`,
    }));
  }, [teamMembers]);

  // Brazil states data from clients - extract state from phone DDD
  const clientsByState = useMemo(() => {
    const stateMap: Record<string, number> = {};
    filteredClients.forEach((client) => {
      // First try to get state from phone DDD
      const stateFromPhone = getStateFromPhone(client.phone);
      if (stateFromPhone) {
        stateMap[stateFromPhone] = (stateMap[stateFromPhone] || 0) + 1;
      }
    });
    return stateMap;
  }, [filteredClients]);

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen">
      {/* Status Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statusCards.map((card, index) => (
          <Card key={card.name} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: card.color }}
                />
                <span className="text-sm text-muted-foreground truncate">{card.name}</span>
              </div>
              <div className="text-3xl font-bold" style={{ color: card.color }}>
                {card.count}
              </div>
              <div className="text-xs text-muted-foreground">
                {card.percentage}% do total
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Timeline Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Evolução dos Tipos de Status
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={dateFilter} onValueChange={(v) => {
                setDateFilter(v as DateFilter);
                if (v !== 'custom') {
                  setCustomDateRange(undefined);
                }
              }}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="7days">7 dias</SelectItem>
                  <SelectItem value="30days">30 dias</SelectItem>
                  <SelectItem value="month">Este mês</SelectItem>
                  <SelectItem value="all">Tudo</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
              {dateFilter === 'custom' && (
                <DateRangePicker
                  dateRange={customDateRange}
                  onDateRangeChange={setCustomDateRange}
                />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="colorNova" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#666" fontSize={10} />
                <YAxis stroke="#666" fontSize={10} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1a1a2e', 
                    border: '1px solid #333',
                    borderRadius: '8px',
                  }} 
                />
                <Area type="monotone" dataKey="Nova Conversa" stroke="#22c55e" fill="url(#colorNova)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-4 mt-4 justify-center">
            {['Nova Conversa', 'Análise', 'Qualificado', 'Proposta Aceita', 'Sucesso', 'Não Qualificado'].map((item, i) => (
              <div key={item} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i] }} />
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Three Column Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Origem das Conversas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Origem das conversas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center h-48">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-center text-muted-foreground text-sm">
              Origem das Conversas
            </p>
            <p className="text-center text-muted-foreground text-xs mt-2">
              Identifique quais canais e campanhas estão gerando mais conversas para otimizar sua estratégia.
            </p>
            <Button variant="link" size="sm" className="mt-2">
              Saiba mais sobre Métricas ↗
            </Button>
          </CardContent>
        </Card>

        {/* Funil por Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Funil por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {funnelData.map((item, index) => (
                <div key={item.name} className="relative">
                  <div 
                    className="h-8 rounded flex items-center px-3"
                    style={{ 
                      backgroundColor: item.color,
                      width: `${Math.max(item.percentage, 10)}%`,
                      minWidth: '60px',
                    }}
                  >
                    <span className="text-white text-xs font-medium">
                      {item.count}
                    </span>
                  </div>
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {item.percentage}%
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-4">
              {funnelData.map((item) => (
                <div key={item.name} className="flex items-center gap-1 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Brazil Map - Clients by State */}
        <BrazilMap clientsByState={clientsByState} totalClients={filteredClients.length} />
      </div>

      {/* Real-time indicator */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        DADOS EM TEMPO REAL
      </div>

      {/* Two Column Row - Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Etiquetas (Tags) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4" />
              Etiquetas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientsByStatus.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={clientsByStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {clientsByStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {clientsByStatus.slice(0, 5).map((item) => (
                <div key={item.name} className="flex items-center gap-1 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-muted-foreground">{item.name} - {item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4" />
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientsByStatus.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={clientsByStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {clientsByStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {clientsByStatus.slice(0, 5).map((item) => (
                <div key={item.name} className="flex items-center gap-1 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-muted-foreground">{item.name} - {item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Análise de Responsáveis */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Análise de responsáveis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 text-xs text-muted-foreground border-b pb-2">
                <span>Responsável</span>
                <span className="text-center">Conversas</span>
                <span className="text-right">Última Atividade</span>
              </div>
              {teamActivity.map((member) => (
                <div key={member.name} className="grid grid-cols-3 items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                      {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <span className="text-sm truncate">{member.name}</span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Badge variant="default" className="text-xs">
                      {member.conversations}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {member.resolved}
                    </Badge>
                  </div>
                  <div className="text-right text-xs text-muted-foreground flex items-center justify-end gap-1">
                    <Clock className="h-3 w-3" />
                    {member.lastActivity}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Departamentos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-4 w-4" />
              Departamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientsByDepartment.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={clientsByDepartment}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {clientsByDepartment.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {clientsByDepartment.map((item) => (
                <div key={item.name} className="flex items-center gap-1 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-muted-foreground">{item.name} - {item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
