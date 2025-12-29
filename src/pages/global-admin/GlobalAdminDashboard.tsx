import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Building2, 
  Users, 
  Link2, 
  MessageSquare, 
  TrendingUp,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Calendar
} from "lucide-react";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { exportDashboardToPDF, exportToExcel, getFormattedDate } from "@/lib/exportUtils";
import { toast } from "sonner";
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from "recharts";

// Mock data for charts (replace with real data when available)
const areaChartData = [
  { name: "Jan", empresas: 4, mensagens: 2400 },
  { name: "Fev", empresas: 6, mensagens: 3200 },
  { name: "Mar", empresas: 8, mensagens: 4100 },
  { name: "Abr", empresas: 12, mensagens: 5800 },
  { name: "Mai", empresas: 15, mensagens: 7200 },
  { name: "Jun", empresas: 18, mensagens: 8900 },
];

const barChartData = [
  { name: "Starter", value: 45 },
  { name: "Professional", value: 30 },
  { name: "Enterprise", value: 15 },
];

const pieChartData = [
  { name: "Ativas", value: 75, color: "hsl(var(--primary))" },
  { name: "Trial", value: 15, color: "hsl(var(--chart-2))" },
  { name: "Suspensas", value: 10, color: "hsl(var(--destructive))" },
];

export default function GlobalAdminDashboard() {
  const { dashboardMetrics, isLoading } = useSystemMetrics();

  const statCards = [
    {
      title: "Empresas",
      value: dashboardMetrics?.totalCompanies || 0,
      subValue: `${dashboardMetrics?.activeCompanies || 0} ativas`,
      icon: Building2,
      trend: "+12%",
      trendUp: true,
    },
    {
      title: "Usuários Totais",
      value: dashboardMetrics?.totalUsers || 0,
      icon: Users,
      trend: "+8%",
      trendUp: true,
    },
    {
      title: "Conexões WhatsApp",
      value: dashboardMetrics?.totalConnections || 0,
      subValue: `${dashboardMetrics?.activeConnections || 0} online`,
      icon: Link2,
      trend: "+5%",
      trendUp: true,
    },
    {
      title: "Mensagens",
      value: dashboardMetrics?.totalMessages || 0,
      icon: MessageSquare,
      trend: "+24%",
      trendUp: true,
    },
    {
      title: "Conversas",
      value: dashboardMetrics?.totalConversations || 0,
      icon: TrendingUp,
      trend: "+18%",
      trendUp: true,
    },
    {
      title: "MRR",
      value: `R$ ${(dashboardMetrics?.revenue || 0).toLocaleString("pt-BR")}`,
      icon: DollarSign,
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
          barData: barChartData,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral do sistema MiauChat
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" size="sm">
            <Calendar className="mr-2 h-4 w-4" />
            Últimos 30 dias
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? "..." : stat.value}
              </div>
              <div className="flex items-center justify-between mt-1">
                {stat.subValue && (
                  <p className="text-xs text-muted-foreground">{stat.subValue}</p>
                )}
                <Badge 
                  variant={stat.trendUp ? "default" : "destructive"} 
                  className="text-xs"
                >
                  {stat.trendUp ? (
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 mr-1" />
                  )}
                  {stat.trend}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Area Chart - Crescimento */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Crescimento</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={areaChartData}>
                <defs>
                  <linearGradient id="colorEmpresas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorMensagens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))", 
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px"
                  }} 
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="empresas" 
                  name="Empresas"
                  stroke="hsl(var(--primary))" 
                  fillOpacity={1} 
                  fill="url(#colorEmpresas)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="mensagens" 
                  name="Mensagens (x100)"
                  stroke="hsl(var(--chart-2))" 
                  fillOpacity={1} 
                  fill="url(#colorMensagens)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Bar Chart - Planos */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Plano</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))", 
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px"
                  }} 
                />
                <Bar dataKey="value" name="Empresas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Chart - Status */}
        <Card>
          <CardHeader>
            <CardTitle>Status das Empresas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))", 
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px"
                  }} 
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
