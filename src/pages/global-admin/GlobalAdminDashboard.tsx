import { Button } from "@/components/ui/button";
import { 
  Building2, 
  CheckCircle2,
  Clock, 
  Link2, 
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  FileSpreadsheet,
  AlertTriangle
} from "lucide-react";
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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Mock data for charts
const areaChartData = [
  { name: "Jul", empresas: 30, conexoes: 25 },
  { name: "Ago", empresas: 40, conexoes: 35 },
  { name: "Set", empresas: 55, conexoes: 48 },
  { name: "Out", empresas: 65, conexoes: 58 },
  { name: "Nov", empresas: 90, conexoes: 78 },
  { name: "Dez", empresas: 120, conexoes: 105 },
];

export default function GlobalAdminDashboard() {
  const { dashboardMetrics, isLoading } = useSystemMetrics();

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

  // Calculate pie chart data from real metrics
  const pieChartData = [
    { name: "Ativas", value: dashboardMetrics?.activeCompanies || 0, color: "#22c55e" },
    { name: "Pendentes", value: (dashboardMetrics?.totalCompanies || 0) - (dashboardMetrics?.activeCompanies || 0), color: "#f59e0b" },
    { name: "Com Alertas", value: (alertsData?.warning || 0) + (alertsData?.critical || 0), color: "#ef4444" },
  ].filter(item => item.value > 0);

  const statCards = [
    {
      title: "Total de Empresas",
      value: dashboardMetrics?.totalCompanies || 0,
      description: "vs. mês anterior",
      icon: Building2,
      iconBg: "bg-red-500/10",
      iconColor: "text-red-500",
      trend: "+12%",
      trendUp: true,
    },
    {
      title: "Empresas Ativas",
      value: dashboardMetrics?.activeCompanies || 0,
      description: "Em operação",
      icon: CheckCircle2,
      iconBg: "bg-green-500/10",
      iconColor: "text-green-500",
      trend: "+8%",
      trendUp: true,
    },
    {
      title: "Alertas de Limite",
      value: (alertsData?.warning || 0) + (alertsData?.critical || 0),
      description: `${alertsData?.critical || 0} críticos, ${alertsData?.warning || 0} avisos`,
      icon: AlertTriangle,
      iconBg: alertsData?.critical ? "bg-red-500/10" : "bg-yellow-500/10",
      iconColor: alertsData?.critical ? "text-red-500" : "text-yellow-500",
      trend: alertsData?.critical ? "Ação necessária" : "Monitorando",
      trendUp: false,
    },
    {
      title: "Conexões Ativas",
      value: dashboardMetrics?.activeConnections || 0,
      description: "Funcionando normalmente",
      icon: Link2,
      iconBg: "bg-green-500/10",
      iconColor: "text-green-500",
      trend: "+15%",
      trendUp: true,
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
          chartData: areaChartData,
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

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => (
          <div 
            key={index}
            className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-colors"
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
            <AreaChart data={areaChartData}>
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

      {/* Companies Usage Table */}
      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
        <CompanyUsageTable />
      </div>
    </div>
  );
}
