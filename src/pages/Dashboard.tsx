import { useState, useMemo, useCallback, useEffect } from "react";
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
import { useWhatsAppInstances } from "@/hooks/useWhatsAppInstances";
import { useTags } from "@/hooks/useTags";
import { useDashboardMetrics, type DateFilter, type DashboardFilters } from "@/hooks/useDashboardMetrics";
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
import { DashboardAdvancedFilters } from "@/components/dashboard/DashboardAdvancedFilters";
import { MessageMetricsCards } from "@/components/dashboard/MessageMetricsCards";
import { AttendantPerformanceTable } from "@/components/dashboard/AttendantPerformanceTable";
import { MessageVolumeChart } from "@/components/dashboard/MessageVolumeChart";
import { ConversationOriginCard } from "@/components/dashboard/ConversationOriginCard";
import { OnboardingProgressCard } from "@/components/onboarding/OnboardingProgressCard";
import { useOnboarding } from "@/hooks/useOnboarding";
import { DateRange } from "react-day-picker";
import { getStateFromPhone } from "@/lib/dddToState";
import { supabase } from "@/integrations/supabase/client";

const CHART_COLORS = [
  "#3b82f6", "#f59e0b", "#22c55e", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export default function Dashboard() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("7days");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedAttendants, setSelectedAttendants] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedConnections, setSelectedConnections] = useState<string[]>([]);
  
  const { statuses } = useCustomStatuses();
  const { departments } = useDepartments();
  const { clients, isLoading: clientsLoading } = useClients();
  const { members: teamMembers } = useTeamMembers();
  const { instances: connections } = useWhatsAppInstances();
  const { tags: availableTags } = useTags();

  // Build filters object for metrics hook
  const dashboardFilters: DashboardFilters = useMemo(() => ({
    dateFilter,
    customDateRange,
    attendantIds: selectedAttendants,
    departmentIds: selectedDepartments,
    statusIds: [],
    connectionIds: selectedConnections,
  }), [dateFilter, customDateRange, selectedAttendants, selectedDepartments, selectedConnections]);

  // Use the new metrics hook
  const { messageMetrics, attendantMetrics, timeSeriesData, isLoading: metricsLoading, refetch: refetchMetrics } = useDashboardMetrics(dashboardFilters);

  // Onboarding progress
  const { progress: onboardingProgress, completedCount, totalCount, isLoading: onboardingLoading } = useOnboarding();

  const handleClearAllFilters = useCallback(() => {
    setSelectedAttendants([]);
    setSelectedDepartments([]);
    setSelectedConnections([]);
  }, []);

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
    const cards = statuses.map((status, index) => {
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
    
    return cards;
  }, [statuses, filteredClients]);

  // Timeline data - real evolution based on client creation dates
  const timelineData = useMemo(() => {
    if (filteredClients.length === 0) return [];

    const now = new Date();
    let periods: { start: Date; end: Date; label: string }[] = [];
    
    // Determine granularity based on date filter
    if (dateFilter === 'today') {
      // Hourly for today
      for (let i = 23; i >= 0; i--) {
        const hour = subHours(now, i);
        periods.push({
          start: startOfDay(hour).getTime() === startOfDay(now).getTime() 
            ? new Date(hour.getFullYear(), hour.getMonth(), hour.getDate(), hour.getHours(), 0, 0)
            : hour,
          end: new Date(hour.getFullYear(), hour.getMonth(), hour.getDate(), hour.getHours(), 59, 59),
          label: format(hour, 'HH:00'),
        });
      }
    } else if (dateFilter === '7days') {
      // Daily for 7 days
      for (let i = 6; i >= 0; i--) {
        const day = subDays(now, i);
        periods.push({
          start: startOfDay(day),
          end: endOfDay(day),
          label: format(day, 'dd/MM', { locale: ptBR }),
        });
      }
    } else if (dateFilter === '30days' || dateFilter === 'month') {
      // Daily for 30 days
      const days = dateFilter === '30days' ? 30 : new Date().getDate();
      for (let i = days - 1; i >= 0; i--) {
        const day = subDays(now, i);
        periods.push({
          start: startOfDay(day),
          end: endOfDay(day),
          label: format(day, 'dd/MM', { locale: ptBR }),
        });
      }
    } else if (dateFilter === 'custom' && customDateRange?.from) {
      // Calculate days in custom range
      const startDate = startOfDay(customDateRange.from);
      const endDate = customDateRange.to ? endOfDay(customDateRange.to) : endOfDay(now);
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      for (let i = 0; i < Math.min(daysDiff, 60); i++) {
        const day = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        periods.push({
          start: startOfDay(day),
          end: endOfDay(day),
          label: format(day, 'dd/MM', { locale: ptBR }),
        });
      }
    } else {
      // All time - show last 30 days by default
      for (let i = 29; i >= 0; i--) {
        const day = subDays(now, i);
        periods.push({
          start: startOfDay(day),
          end: endOfDay(day),
          label: format(day, 'dd/MM', { locale: ptBR }),
        });
      }
    }

    // Build data for each period
    const activeStatuses = statuses;
    
    return periods.map(period => {
      const dataPoint: Record<string, string | number> = { time: period.label };
      
      activeStatuses.forEach(status => {
        const count = filteredClients.filter(client => {
          const clientDate = parseISO(client.created_at);
          return client.custom_status_id === status.id &&
                 clientDate >= period.start &&
                 clientDate <= period.end;
        }).length;
        dataPoint[status.name] = count;
      });

      // Count clients without status
      const noStatusCount = filteredClients.filter(client => {
        const clientDate = parseISO(client.created_at);
        return !client.custom_status_id &&
               clientDate >= period.start &&
               clientDate <= period.end;
      }).length;
      
      if (noStatusCount > 0) {
        dataPoint['Sem Status'] = noStatusCount;
      }
      
      return dataPoint;
    });
  }, [filteredClients, statuses, dateFilter, customDateRange]);

  // Funnel data
  const funnelData = useMemo(() => {
    const statusOrder = statuses;
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

  // Clients by tags - query client_tags table for real tag distribution
  const [clientTagCounts, setClientTagCounts] = useState<{ name: string; value: number; color: string }[]>([]);

  useEffect(() => {
    const fetchTagCounts = async () => {
      if (availableTags.length === 0 || filteredClients.length === 0) {
        setClientTagCounts([]);
        return;
      }

      const clientIds = filteredClients.map(c => c.id);
      // Fetch client_tags for filtered clients
      const { data: clientTags } = await supabase
        .from("client_tags")
        .select("tag_id")
        .in("client_id", clientIds);

      if (!clientTags || clientTags.length === 0) {
        setClientTagCounts([]);
        return;
      }

      // Count by tag
      const tagCountMap: Record<string, number> = {};
      clientTags.forEach(ct => {
        tagCountMap[ct.tag_id] = (tagCountMap[ct.tag_id] || 0) + 1;
      });

      const result = availableTags
        .map((tag, index) => ({
          name: tag.name,
          value: tagCountMap[tag.id] || 0,
          color: tag.color || CHART_COLORS[index % CHART_COLORS.length],
        }))
        .filter(t => t.value > 0)
        .sort((a, b) => b.value - a.value);

      setClientTagCounts(result);
    };

    fetchTagCounts();
  }, [availableTags, filteredClients]);

  // Team members activity - Uses real metrics from attendantMetrics
  const TEAM_METRICS_ENABLED = true;
  
  const teamActivity = useMemo(() => {
    if (!TEAM_METRICS_ENABLED || attendantMetrics.length === 0) {
      return [];
    }
    return attendantMetrics.slice(0, 8).map((metric) => ({
      name: metric.name,
      avatar: metric.avatarUrl,
      conversations: metric.conversationsHandled,
      messagesSent: metric.messagesSent,
      messagesReceived: metric.messagesReceived,
      avgResponseTime: metric.avgResponseTime,
    }));
  }, [attendantMetrics]);

  // Clients by state (from phone DDD)
  const clientsByState = useMemo(() => {
    const stateMap: Record<string, number> = {};
    filteredClients.forEach((client) => {
      const stateFromPhone = getStateFromPhone(client.phone);
      if (stateFromPhone) {
        stateMap[stateFromPhone] = (stateMap[stateFromPhone] || 0) + 1;
      }
    });
    
    // Convert to array and sort by count
    return Object.entries(stateMap)
      .map(([state, count], index) => ({
        name: state,
        value: count,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Top 10 states
  }, [filteredClients]);


  return (
    <div className="p-6 space-y-6 bg-background min-h-screen">
      {/* Onboarding Progress Card - Sempre visível após carregar */}
      {!onboardingLoading && (
        <OnboardingProgressCard
          progress={onboardingProgress}
          completedSteps={completedCount}
          totalSteps={totalCount}
        />
      )}

      {/* Header with Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Visão geral dos seus clientes e métricas</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={dateFilter} onValueChange={(v) => {
              setDateFilter(v as DateFilter);
              if (v !== 'custom') {
                setCustomDateRange(undefined);
              }
            }}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7days">Últimos 7 dias</SelectItem>
                <SelectItem value="30days">Últimos 30 dias</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {dateFilter === 'custom' && (
              <DateRangePicker
                dateRange={customDateRange}
                onDateRangeChange={setCustomDateRange}
              />
            )}
            <DashboardAdvancedFilters
              teamMembers={teamMembers.map(m => ({ id: m.id, full_name: m.full_name || "", avatar_url: m.avatar_url }))}
              departments={departments.map(d => ({ id: d.id, name: d.name, color: d.color }))}
              connections={connections.map(c => ({ id: c.id, name: c.display_name || c.instance_name }))}
              selectedAttendants={selectedAttendants}
              selectedDepartments={selectedDepartments}
              selectedConnections={selectedConnections}
              onAttendantsChange={setSelectedAttendants}
              onDepartmentsChange={setSelectedDepartments}
              onConnectionsChange={setSelectedConnections}
              onClearAll={handleClearAllFilters}
              onRefresh={refetchMetrics}
              isLoading={metricsLoading}
            />
          </div>
        </div>
      </div>

      {/* Message Metrics Cards */}
      <MessageMetricsCards metrics={messageMetrics} isLoading={metricsLoading} />

      {/* Message Volume Chart */}
      <MessageVolumeChart data={timeSeriesData} isLoading={metricsLoading} />

      {/* Status Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
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
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Evolução dos Tipos de Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timelineData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              Nenhum dado disponível para o período selecionado
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData}>
                  <defs>
                    {statuses.map((status, index) => (
                      <linearGradient key={status.id} id={`color-${index}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={status.color || CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.4}/>
                        <stop offset="95%" stopColor={status.color || CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.05}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis 
                    dataKey="time" 
                    className="text-muted-foreground" 
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    className="text-muted-foreground" 
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  {statuses.map((status, index) => (
                    <Area 
                      key={status.id}
                      type="monotone" 
                      dataKey={status.name} 
                      stroke={status.color || CHART_COLORS[index % CHART_COLORS.length]} 
                      fill={`url(#color-${index})`}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap gap-4 mt-4 justify-center">
            {statuses.map((status, i) => (
              <div key={status.id} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color || CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-muted-foreground">{status.name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Three Column Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Origem das Conversas */}
        <ConversationOriginCard filters={dashboardFilters} />

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

        {/* Distribution by State */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Map className="h-4 w-4" />
              Clientes por Estado (DDD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientsByState.length > 0 ? (
              <>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={clientsByState}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {clientsByState.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number, name: string) => [`${value} clientes`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 justify-center">
                  {clientsByState.slice(0, 8).map((item) => (
                    <div key={item.name} className="flex items-center gap-1 text-xs">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-muted-foreground">{item.name}: {item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>
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
            {clientTagCounts.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={clientTagCounts}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {clientTagCounts.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number, name: string) => [`${value} clientes`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Nenhuma etiqueta atribuída
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {clientTagCounts.slice(0, 8).map((item) => (
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
              {clientsByStatus.map((item) => (
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
        {/* Desempenho por Atendente - New component with real data */}
        <AttendantPerformanceTable 
          attendants={attendantMetrics} 
          isLoading={metricsLoading} 
        />

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
