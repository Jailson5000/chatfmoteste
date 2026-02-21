import { Button } from "@/components/ui/button";
import { 
  Building2, 
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  FileSpreadsheet,
  AlertTriangle,
  PlayCircle,
  Hourglass
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { exportDashboardToPDF, exportToExcel, getFormattedDate } from "@/lib/exportUtils";
import { toast } from "sonner";
import { 
  AreaChart, 
  Area, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
} from "recharts";
import { CompanyUsageTable } from "@/components/global-admin/CompanyUsageTable";
import { InfrastructureMonitor } from "@/components/global-admin/InfrastructureMonitor";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRef, useState } from "react";

export default function GlobalAdminDashboard() {
  const { dashboardMetrics, growthData, isLoading } = useSystemMetrics();
  const tableRef = useRef<HTMLDivElement>(null);
  const [filterByAlerts, setFilterByAlerts] = useState(false);
  const navigate = useNavigate();

  // Fetch companies with alerts (80%+ usage)
  const { data: alertsData } = useQuery({
    queryKey: ["company-alerts-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("company_usage_summary").select("*");
      
      if (!data) return { warning: 0, critical: 0 };

      let warning = 0;
      let critical = 0;

      data.forEach((company: any) => {
        const metrics = [
          { current: company.current_users || 0, max: company.effective_max_users || 1 },
          { current: company.current_instances || 0, max: company.effective_max_instances || 1 },
          { current: company.current_agents || 0, max: company.effective_max_agents || 1 },
          { current: company.current_ai_conversations || 0, max: company.effective_max_ai_conversations || 1 },
          { current: company.current_tts_minutes || 0, max: company.effective_max_tts_minutes || 1 },
        ];

        const hasCritical = metrics.some((m) => m.max > 0 && (m.current / m.max) >= 1);
        const hasWarning = metrics.some((m) => m.max > 0 && (m.current / m.max) >= 0.8 && (m.current / m.max) < 1);

        if (hasCritical) critical++;
        else if (hasWarning) warning++;
      });

      return { warning, critical };
    },
  });

  // Calculate pie chart data from real granular metrics
  const pieChartData = [
    { name: "Ativas", value: dashboardMetrics?.companiesApproved || 0, color: "#22c55e" },
    { name: "Em Trial", value: dashboardMetrics?.companiesInTrial || 0, color: "#3b82f6" },
    { name: "Pendentes", value: dashboardMetrics?.companiesPendingApproval || 0, color: "#f59e0b" },
    { name: "Trial Expirado", value: dashboardMetrics?.companiesTrialExpired || 0, color: "#ef4444" },
  ].filter(item => item.value > 0);

  const statCards = [
    {
      title: "Total de Empresas",
      value: dashboardMetrics?.totalCompanies || 0,
      description: "Cadastradas no sistema",
      icon: Building2,
      iconBg: "bg-slate-500/10",
      iconColor: "text-slate-400",
      trend: `${dashboardMetrics?.totalConnections || 0} conexões`,
      trendUp: true,
      onClick: () => navigate("/global-admin/companies"),
    },
    {
      title: "Empresas Ativas",
      value: dashboardMetrics?.companiesApproved || 0,
      description: "Aprovadas e em operação",
      icon: CheckCircle2,
      iconBg: "bg-green-500/10",
      iconColor: "text-green-500",
      trend: "Em produção",
      trendUp: true,
      onClick: () => navigate("/global-admin/companies?tab=approved"),
    },
    {
      title: "Em Trial",
      value: dashboardMetrics?.companiesInTrial || 0,
      description: dashboardMetrics?.companiesTrialExpired 
        ? `${dashboardMetrics.companiesTrialExpired} expirado(s)` 
        : "Período de teste ativo",
      icon: PlayCircle,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
      trend: dashboardMetrics?.companiesTrialExpired ? "Atenção" : "Monitorando",
      trendUp: !dashboardMetrics?.companiesTrialExpired,
      onClick: () => navigate("/global-admin/companies?trial=active"),
    },
    {
      title: "Aguardando Aprovação",
      value: dashboardMetrics?.companiesPendingApproval || 0,
      description: "Precisam de revisão",
      icon: Hourglass,
      iconBg: "bg-yellow-500/10",
      iconColor: "text-yellow-500",
      trend: dashboardMetrics?.companiesPendingApproval ? "Ação necessária" : "Tudo ok",
      trendUp: !dashboardMetrics?.companiesPendingApproval,
      onClick: () => navigate("/global-admin/companies?tab=pending"),
    },
  ];

  const handleExportPDF = () => {
    try {
      exportDashboardToPDF(
        {
          metrics: {
            empresas: dashboardMetrics?.totalCompanies || 0,
            usuarios: dashboardMetrics?.totalUsers || 0,
            conexoes: dashboardMetrics?.totalConnections || 0,
            mensagens: dashboardMetrics?.totalMessages || 0,
            conversas: dashboardMetrics?.totalConversations || 0,
            mrr: dashboardMetrics?.revenue || 0,
          },
          chartData: growthData,
          pieData: pieChartData.map(p => ({ name: p.name, value: p.value })),
          barData: [],
        },
        `miauchat-dashboard-${getFormattedDate()}`
      );
      toast.success("Relatório PDF exportado com sucesso!");
    } catch (error) {
      toast.error("Erro ao exportar PDF");
      console.error(error);
    }
  };

  const handleExportExcel = () => {
    try {
      const metricsData = [
        { Métrica: "Total de Empresas", Valor: dashboardMetrics?.totalCompanies || 0 },
        { Métrica: "Empresas Ativas", Valor: dashboardMetrics?.activeCompanies || 0 },
        { Métrica: "Usuários Totais", Valor: dashboardMetrics?.totalUsers || 0 },
        { Métrica: "Conexões WhatsApp", Valor: dashboardMetrics?.totalConnections || 0 },
        { Métrica: "Conexões Ativas", Valor: dashboardMetrics?.activeConnections || 0 },
        { Métrica: "Total de Mensagens", Valor: dashboardMetrics?.totalMessages || 0 },
        { Métrica: "Total de Conversas", Valor: dashboardMetrics?.totalConversations || 0 },
        { Métrica: "MRR (R$)", Valor: dashboardMetrics?.revenue || 0 },
      ];
      
      exportToExcel(metricsData, `miauchat-dashboard-${getFormattedDate()}`, "Métricas");
      toast.success("Relatório Excel exportado com sucesso!");
    } catch (error) {
      toast.error("Erro ao exportar Excel");
      console.error(error);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-3 shadow-xl">
          <p className="text-white/60 text-sm mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard</h1>
          <p className="text-white/50">
            Visão geral do sistema MiauChat
          </p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="bg-white/[0.03] border-white/10 text-white hover:bg-white/[0.08] hover:text-white"
            onClick={handleExportPDF}
          >
            <FileText className="mr-2 h-4 w-4" />
            Exportar PDF
          </Button>
          <Button 
            variant="outline" 
            className="bg-white/[0.03] border-white/10 text-white hover:bg-white/[0.08] hover:text-white"
            onClick={handleExportExcel}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Alerta de Trials Expirando em 2 dias */}
      {dashboardMetrics?.companiesTrialExpiringSoon !== undefined && dashboardMetrics.companiesTrialExpiringSoon > 0 && (
        <div 
          className="p-4 rounded-xl bg-warning/10 border border-warning/30 flex items-center gap-4 cursor-pointer hover:bg-warning/15 transition-colors"
          onClick={() => navigate("/global-admin/companies?trial=expiring_soon")}
        >
          <div className="p-3 rounded-full bg-warning/20">
            <AlertTriangle className="h-6 w-6 text-warning" />
          </div>
          <div className="flex-1">
            <p className="text-warning font-semibold">
              {dashboardMetrics.companiesTrialExpiringSoon} empresa(s) com trial expirando em até 2 dias
            </p>
            <p className="text-muted-foreground text-sm">
              Clique para ver e tomar ação preventiva
            </p>
          </div>
          <ArrowUpRight className="h-5 w-5 text-warning" />
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => (
          <div 
            key={index}
            className={`p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-colors ${stat.onClick ? 'cursor-pointer' : ''}`}
            onClick={stat.onClick}
          >
            <div className="flex items-start justify-between mb-4">
              <span className="text-sm text-white/60">{stat.title}</span>
              <div className={`p-2 rounded-xl ${stat.iconBg}`}>
                <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
              </div>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-4xl font-bold text-white">
                {isLoading ? "..." : stat.value}
              </span>
              <span className={`flex items-center text-sm font-medium ${stat.trendUp ? 'text-green-400' : 'text-yellow-400'}`}>
                {stat.trendUp ? (
                  <ArrowUpRight className="h-4 w-4 mr-0.5" />
                ) : (
                  <ArrowDownRight className="h-4 w-4 mr-0.5" />
                )}
                {stat.trend}
              </span>
            </div>
            <p className="text-sm text-white/40 mt-1">{stat.description}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Area Chart - Crescimento Mensal */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">Crescimento Mensal</h2>
            <p className="text-sm text-white/40">Evolução de empresas e conexões</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={growthData}>
              <defs>
                <linearGradient id="colorEmpresas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorConexoes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#dc2626" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis 
                dataKey="name" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="empresas" 
                name="Empresas"
                stroke="#22c55e" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorEmpresas)" 
              />
              <Area 
                type="monotone" 
                dataKey="conexoes" 
                name="Conexões"
                stroke="#dc2626" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorConexoes)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart - Status das Empresas */}
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">Status das Empresas</h2>
            <p className="text-sm text-white/40">Distribuição por status</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-3 shadow-xl">
                        <p className="text-white text-sm">
                          {payload[0].name}: {payload[0].value}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex justify-center gap-4 mt-2">
            {pieChartData.map((entry, index) => (
              <div key={index} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-white/60">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Infrastructure Monitoring */}
      <InfrastructureMonitor />

      {/* Companies Usage Table */}
      <div ref={tableRef} className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
        <CompanyUsageTable 
          initialFilter={filterByAlerts ? "critical" : undefined}
          onFilterChange={(filter) => setFilterByAlerts(filter === "critical" || filter === "warning")}
        />
      </div>
    </div>
  );
}
