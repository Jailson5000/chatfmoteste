import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanies } from "@/hooks/useCompanies";
import { 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Server, 
  Zap, 
  RefreshCw, 
  Heart,
  TrendingUp,
  Building2,
  XCircle
} from "lucide-react";
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
  BarChart,
  Bar,
  Legend
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const COLORS = {
  active: '#22c55e',
  partial: '#eab308',
  pending: '#3b82f6',
  error: '#ef4444',
  healthy: '#22c55e',
  degraded: '#eab308',
  unhealthy: '#ef4444',
  unknown: '#6b7280',
};

export default function GlobalAdminProvisioningDashboard() {
  const { companies, isLoading, runHealthCheck, retryAllFailedWorkflows } = useCompanies();
  const [activeTab, setActiveTab] = useState("overview");

  // Calculate statistics
  const stats = {
    total: companies.length,
    active: companies.filter(c => c.provisioning_status === 'active').length,
    partial: companies.filter(c => c.provisioning_status === 'partial').length,
    pending: companies.filter(c => c.provisioning_status === 'pending').length,
    error: companies.filter(c => c.provisioning_status === 'error').length,
    
    clientAppCreated: companies.filter(c => c.client_app_status === 'created').length,
    clientAppError: companies.filter(c => c.client_app_status === 'error').length,
    
    n8nCreated: companies.filter(c => c.n8n_workflow_status === 'created').length,
    n8nError: companies.filter(c => c.n8n_workflow_status === 'error' || c.n8n_workflow_status === 'failed').length,
    n8nPending: companies.filter(c => !c.n8n_workflow_status || c.n8n_workflow_status === 'pending').length,
    
    healthy: companies.filter(c => c.health_status === 'healthy').length,
    degraded: companies.filter(c => c.health_status === 'degraded').length,
    unhealthy: companies.filter(c => c.health_status === 'unhealthy').length,
    unknown: companies.filter(c => !c.health_status || c.health_status === 'unknown').length,
  };

  // Data for provisioning status pie chart
  const provisioningData = [
    { name: 'Ativo', value: stats.active, color: COLORS.active },
    { name: 'Parcial', value: stats.partial, color: COLORS.partial },
    { name: 'Pendente', value: stats.pending, color: COLORS.pending },
    { name: 'Erro', value: stats.error, color: COLORS.error },
  ].filter(d => d.value > 0);

  // Data for health status pie chart
  const healthData = [
    { name: 'Saudável', value: stats.healthy, color: COLORS.healthy },
    { name: 'Degradado', value: stats.degraded, color: COLORS.degraded },
    { name: 'Não Saudável', value: stats.unhealthy, color: COLORS.unhealthy },
    { name: 'Desconhecido', value: stats.unknown, color: COLORS.unknown },
  ].filter(d => d.value > 0);

  // Data for component status bar chart
  const componentData = [
    { 
      name: 'Client App', 
      created: stats.clientAppCreated, 
      error: stats.clientAppError,
      pending: stats.total - stats.clientAppCreated - stats.clientAppError,
    },
    { 
      name: 'n8n Workflow', 
      created: stats.n8nCreated, 
      error: stats.n8nError,
      pending: stats.n8nPending,
    },
  ];

  // Companies with issues
  const companiesWithIssues = companies.filter(
    c => c.provisioning_status !== 'active' || 
         c.health_status === 'degraded' || 
         c.health_status === 'unhealthy'
  );

  // Recent provisioning (last 7 days simulated based on created_at)
  const recentCompanies = companies
    .filter(c => {
      const created = new Date(c.created_at);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return created >= sevenDaysAgo;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monitoramento de Provisionamento</h1>
          <p className="text-muted-foreground">
            Acompanhe o status de provisionamento e saúde de todos os tenants
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => runHealthCheck.mutate(undefined)}
            disabled={runHealthCheck.isPending}
          >
            <Heart className={`mr-2 h-4 w-4 ${runHealthCheck.isPending ? 'animate-pulse text-red-500' : ''}`} />
            Health Check
          </Button>
          {stats.n8nError > 0 && (
            <Button
              variant="outline"
              onClick={() => retryAllFailedWorkflows.mutate()}
              disabled={retryAllFailedWorkflows.isPending}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${retryAllFailedWorkflows.isPending ? 'animate-spin' : ''}`} />
              Retry Falhas ({stats.n8nError})
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Empresas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.active} ativas • {stats.partial + stats.error} com problemas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Provisionamento Completo</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(1) : 0}% do total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Provisionamento Parcial</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.partial}</div>
            <p className="text-xs text-muted-foreground">
              Requer atenção
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Workflows n8n Falhos</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.n8nError}</div>
            <p className="text-xs text-muted-foreground">
              Aguardando retry automático
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="health">Saúde</TabsTrigger>
          <TabsTrigger value="issues">Problemas</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Provisioning Status Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Status de Provisionamento
                </CardTitle>
                <CardDescription>
                  Distribuição das empresas por status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={provisioningData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {provisioningData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Component Status Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Status por Componente
                </CardTitle>
                <CardDescription>
                  Client App vs Workflow n8n
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={componentData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                      <YAxis dataKey="name" type="category" width={100} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="created" name="Criado" fill={COLORS.active} stackId="stack" />
                      <Bar dataKey="pending" name="Pendente" fill={COLORS.pending} stackId="stack" />
                      <Bar dataKey="error" name="Erro" fill={COLORS.error} stackId="stack" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Health Status Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5" />
                  Status de Saúde
                </CardTitle>
                <CardDescription>
                  Resultado do último health check
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={healthData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {healthData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Health KPIs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Métricas de Saúde
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                    <div>
                      <p className="font-medium">Saudável</p>
                      <p className="text-sm text-muted-foreground">Todos os componentes OK</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-green-600">{stats.healthy}</span>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-6 w-6 text-yellow-500" />
                    <div>
                      <p className="font-medium">Degradado</p>
                      <p className="text-sm text-muted-foreground">Alguns componentes com falha</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-yellow-600">{stats.degraded}</span>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-3">
                    <XCircle className="h-6 w-6 text-red-500" />
                    <div>
                      <p className="font-medium">Não Saudável</p>
                      <p className="text-sm text-muted-foreground">Múltiplos componentes em falha</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-red-600">{stats.unhealthy}</span>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-3">
                    <Clock className="h-6 w-6 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Desconhecido</p>
                      <p className="text-sm text-muted-foreground">Aguardando health check</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold">{stats.unknown}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="issues" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                Empresas com Problemas ({companiesWithIssues.length})
              </CardTitle>
              <CardDescription>
                Empresas que requerem atenção ou intervenção manual
              </CardDescription>
            </CardHeader>
            <CardContent>
              {companiesWithIssues.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                  <h3 className="font-semibold text-lg">Tudo OK!</h3>
                  <p className="text-muted-foreground">Nenhuma empresa com problemas no momento.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {companiesWithIssues.map((company) => (
                    <div 
                      key={company.id} 
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{company.name}</span>
                            {company.law_firm?.subdomain && (
                              <Badge variant="outline" className="text-xs">
                                {company.law_firm.subdomain}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Server className="h-3 w-3" />
                              {company.client_app_status || 'pending'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              {company.n8n_workflow_status || 'pending'}
                            </span>
                            {company.n8n_retry_count > 0 && (
                              <span className="flex items-center gap-1 text-yellow-600">
                                <RefreshCw className="h-3 w-3" />
                                {company.n8n_retry_count} retries
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline"
                          className={
                            company.provisioning_status === 'partial' 
                              ? 'border-yellow-500 text-yellow-600' 
                              : company.provisioning_status === 'error'
                              ? 'border-red-500 text-red-600'
                              : 'border-blue-500 text-blue-600'
                          }
                        >
                          {company.provisioning_status || 'pending'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recent Provisioning */}
      {recentCompanies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Provisionamentos Recentes
            </CardTitle>
            <CardDescription>
              Últimos 7 dias
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentCompanies.slice(0, 5).map((company) => (
                <div 
                  key={company.id} 
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    {company.provisioning_status === 'active' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : company.provisioning_status === 'partial' ? (
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    ) : (
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">{company.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(company.created_at), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <Badge 
                    variant={company.provisioning_status === 'active' ? 'default' : 'secondary'}
                  >
                    {company.provisioning_status || 'pending'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
