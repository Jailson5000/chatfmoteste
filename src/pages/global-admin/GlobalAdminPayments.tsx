import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  CreditCard, 
  DollarSign, 
  Users, 
  TrendingUp, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PaymentMetrics {
  activeProvider: string;
  stripe: ProviderMetrics;
  asaas: ProviderMetrics;
}

interface ProviderMetrics {
  connected: boolean;
  mrr: number;
  arr: number;
  activeSubscriptions: number;
  totalCustomers: number;
  recentPayments: Payment[];
  subscriptionsByPlan: Record<string, number>;
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  customerEmail: string;
  createdAt: string;
  description: string;
}

export default function GlobalAdminPayments() {
  const { data: metrics, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["payment-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-payment-metrics");
      if (error) throw error;
      return data as PaymentMetrics;
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const formatCurrency = (value: number, currency = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      succeeded: { label: "Pago", variant: "default" },
      paid: { label: "Pago", variant: "default" },
      CONFIRMED: { label: "Confirmado", variant: "default" },
      RECEIVED: { label: "Recebido", variant: "default" },
      pending: { label: "Pendente", variant: "secondary" },
      PENDING: { label: "Pendente", variant: "secondary" },
      failed: { label: "Falhou", variant: "destructive" },
      OVERDUE: { label: "Vencido", variant: "destructive" },
    };

    const config = statusMap[status] || { label: status, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const renderProviderMetrics = (provider: ProviderMetrics, providerName: string) => {
    if (!provider.connected) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <XCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">
            {providerName} não configurado
          </h3>
          <p className="text-sm text-muted-foreground mt-2">
            Configure a API key nas configurações para ver as métricas
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">MRR</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                {formatCurrency(provider.mrr)}
              </div>
              <p className="text-xs text-muted-foreground">
                Receita Mensal Recorrente
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">ARR</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(provider.arr)}
              </div>
              <p className="text-xs text-muted-foreground">
                Receita Anual Recorrente
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {provider.activeSubscriptions}
              </div>
              <p className="text-xs text-muted-foreground">
                Clientes pagantes
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {provider.totalCustomers}
              </div>
              <p className="text-xs text-muted-foreground">
                Cadastrados na plataforma
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Subscriptions by Plan */}
        {Object.keys(provider.subscriptionsByPlan).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assinaturas por Plano</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {Object.entries(provider.subscriptionsByPlan).map(([plan, count]) => (
                  <div
                    key={plan}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted"
                  >
                    <span className="font-medium">{plan}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Payments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pagamentos Recentes</CardTitle>
            <CardDescription>
              Últimos 10 pagamentos processados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {provider.recentPayments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">Nenhum pagamento encontrado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {provider.recentPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <DollarSign className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {formatCurrency(payment.amount, payment.currency)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {payment.customerEmail || payment.description || "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {getStatusBadge(payment.status)}
                        <span className="text-sm text-muted-foreground">
                          {payment.createdAt ? format(new Date(payment.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard de Pagamentos</h1>
          <p className="text-muted-foreground">
            Visão geral das métricas de receita e assinaturas
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Active Provider Badge */}
      {metrics && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Provedor ativo:</span>
          <Badge variant="default" className="uppercase">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {metrics.activeProvider}
          </Badge>
        </div>
      )}

      {/* Provider Tabs */}
      <Tabs defaultValue={metrics?.activeProvider || "stripe"} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="stripe" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Stripe
            {metrics?.stripe.connected && (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            )}
          </TabsTrigger>
          <TabsTrigger value="asaas" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            ASAAS
            {metrics?.asaas.connected && (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stripe">
          {metrics && renderProviderMetrics(metrics.stripe, "Stripe")}
        </TabsContent>

        <TabsContent value="asaas">
          {metrics && renderProviderMetrics(metrics.asaas, "ASAAS")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
