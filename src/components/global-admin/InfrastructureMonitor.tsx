import { Database, HardDrive, Bot, Activity, RefreshCw, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useInfrastructureMetrics, AlertStatus } from "@/hooks/useInfrastructureMetrics";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function getStatusIcon(status: AlertStatus) {
  switch (status) {
    case "critical":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  }
}

function getProgressColor(status: AlertStatus): string {
  switch (status) {
    case "critical":
      return "bg-red-500";
    case "warning":
      return "bg-yellow-500";
    default:
      return "bg-green-500";
  }
}

function MetricCard({
  title,
  icon: Icon,
  status,
  current,
  limit,
  percent,
  children,
}: {
  title: string;
  icon: React.ElementType;
  status: AlertStatus;
  current: string;
  limit: string;
  percent: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-2 rounded-xl",
            status === "critical" ? "bg-red-500/10" :
            status === "warning" ? "bg-yellow-500/10" : "bg-green-500/10"
          )}>
            <Icon className={cn(
              "h-4 w-4",
              status === "critical" ? "text-red-500" :
              status === "warning" ? "text-yellow-500" : "text-green-500"
            )} />
          </div>
          <span className="text-sm font-medium text-white">{title}</span>
        </div>
        {getStatusIcon(status)}
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-white/60">{current}</span>
          <span className="text-white/40">/ {limit}</span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={cn("h-full transition-all", getProgressColor(status))}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        <div className="text-right text-xs font-medium text-white/60">
          {percent.toFixed(1)}%
        </div>
      </div>
      
      {children}
    </div>
  );
}

export function InfrastructureMonitor() {
  const { database, storage, aiUsage, databaseStatus, storageStatus, isLoading, refetch } = useInfrastructureMetrics();

  const aiConversationsGrowth = aiUsage?.last_month?.ai_conversations 
    ? ((aiUsage.current_month.ai_conversations - aiUsage.last_month.ai_conversations) / aiUsage.last_month.ai_conversations * 100)
    : 0;

  const ttsGrowth = aiUsage?.last_month?.tts_minutes 
    ? ((aiUsage.current_month.tts_minutes - aiUsage.last_month.tts_minutes) / aiUsage.last_month.tts_minutes * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Monitoramento de Infraestrutura</h2>
          <p className="text-sm text-white/40">Métricas do sistema em tempo real</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="bg-white/[0.03] border-white/10 text-white hover:bg-white/[0.08] hover:text-white"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Database */}
        <MetricCard
          title="Banco de Dados"
          icon={Database}
          status={databaseStatus}
          current={database?.database_size_pretty || "..."}
          limit={database?.database_limit_pretty || "8 GB"}
          percent={database?.percent_used || 0}
        />

        {/* Storage */}
        <MetricCard
          title="Storage"
          icon={HardDrive}
          status={storageStatus}
          current={storage?.storage_size_pretty || "..."}
          limit={storage?.storage_limit_pretty || "100 GB"}
          percent={storage?.percent_used || 0}
        >
          {storage?.buckets && storage.buckets.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <span className="text-xs text-white/40">Buckets:</span>
              <div className="mt-1 space-y-1">
                {storage.buckets.slice(0, 3).map((bucket) => (
                  <div key={bucket.bucket} className="flex justify-between text-xs">
                    <span className="text-white/60 truncate max-w-[100px]">{bucket.bucket}</span>
                    <span className="text-white/40">{bucket.size_pretty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </MetricCard>

        {/* AI Usage */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-xl bg-blue-500/10">
              <Bot className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-sm font-medium text-white">Uso de IA (mês)</span>
          </div>
          
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-bold text-white">
                  {aiUsage?.current_month?.ai_conversations?.toLocaleString() || "0"}
                </span>
                <span className={cn(
                  "text-xs font-medium",
                  aiConversationsGrowth >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {aiConversationsGrowth >= 0 ? "+" : ""}{aiConversationsGrowth.toFixed(0)}%
                </span>
              </div>
              <span className="text-xs text-white/40">Conversas IA</span>
            </div>
            
            <div>
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-semibold text-white">
                  {aiUsage?.current_month?.tts_minutes?.toLocaleString() || "0"}
                </span>
                <span className={cn(
                  "text-xs font-medium",
                  ttsGrowth >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {ttsGrowth >= 0 ? "+" : ""}{ttsGrowth.toFixed(0)}%
                </span>
              </div>
              <span className="text-xs text-white/40">Minutos TTS</span>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-xl bg-purple-500/10">
              <Activity className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-sm font-medium text-white">Status do Sistema</span>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-white/60">Empresas ativas</span>
              <span className="text-white font-medium">{aiUsage?.total_companies || 0}</span>
            </div>
            
            <div className="flex justify-between text-xs">
              <span className="text-white/60">Último cleanup</span>
              <span className="text-white/40">
                {aiUsage?.last_webhook_cleanup 
                  ? format(new Date(aiUsage.last_webhook_cleanup), "dd/MM HH:mm", { locale: ptBR })
                  : "N/A"}
              </span>
            </div>
            
            <div className="flex justify-between text-xs">
              <span className="text-white/60">Status geral</span>
              <span className={cn(
                "font-medium",
                databaseStatus === "critical" || storageStatus === "critical" 
                  ? "text-red-400" 
                  : databaseStatus === "warning" || storageStatus === "warning"
                    ? "text-yellow-400"
                    : "text-green-400"
              )}>
                {databaseStatus === "critical" || storageStatus === "critical" 
                  ? "Crítico" 
                  : databaseStatus === "warning" || storageStatus === "warning"
                    ? "Atenção"
                    : "Saudável"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
