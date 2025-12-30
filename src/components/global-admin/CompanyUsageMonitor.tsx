import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, Wifi, Bot, MessageSquare, Volume2, Layers, AlertTriangle, CheckCircle } from "lucide-react";

interface UsageMetric {
  label: string;
  current: number;
  max: number;
  icon: React.ReactNode;
  unit?: string;
}

interface CompanyUsageMonitorProps {
  usage: {
    current_users: number;
    current_instances: number;
    current_agents: number;
    current_ai_conversations: number;
    current_tts_minutes: number;
  };
  limits: {
    max_users: number;
    max_instances: number;
    max_agents: number;
    max_workspaces: number;
    max_ai_conversations: number;
    max_tts_minutes: number;
  };
  planName?: string;
  useCustomLimits?: boolean;
  compact?: boolean;
}

export function CompanyUsageMonitor({
  usage,
  limits,
  planName,
  useCustomLimits,
  compact = false,
}: CompanyUsageMonitorProps) {
  const metrics: UsageMetric[] = [
    {
      label: "Usuários",
      current: usage.current_users,
      max: limits.max_users,
      icon: <Users className="h-4 w-4" />,
    },
    {
      label: "Conexões",
      current: usage.current_instances,
      max: limits.max_instances,
      icon: <Wifi className="h-4 w-4" />,
    },
    {
      label: "Agentes IA",
      current: usage.current_agents,
      max: limits.max_agents,
      icon: <Bot className="h-4 w-4" />,
    },
    {
      label: "Conversas IA",
      current: usage.current_ai_conversations,
      max: limits.max_ai_conversations,
      icon: <MessageSquare className="h-4 w-4" />,
      unit: "/mês",
    },
    {
      label: "Áudio TTS",
      current: Math.round(usage.current_tts_minutes * 10) / 10,
      max: limits.max_tts_minutes,
      icon: <Volume2 className="h-4 w-4" />,
      unit: " min/mês",
    },
  ];

  const getPercentage = (current: number, max: number) => {
    if (max <= 0) return 0;
    return Math.min(100, Math.round((current / max) * 100));
  };

  const getStatusColor = (percent: number) => {
    if (percent >= 100) return "text-red-600";
    if (percent >= 95) return "text-orange-600";
    if (percent >= 80) return "text-yellow-600";
    return "text-green-600";
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 100) return "bg-red-500";
    if (percent >= 95) return "bg-orange-500";
    if (percent >= 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getAlertBadge = (percent: number) => {
    if (percent >= 100) {
      return (
        <Badge variant="destructive" className="text-xs animate-pulse">
          Limite atingido
        </Badge>
      );
    }
    if (percent >= 95) {
      return (
        <Badge className="text-xs bg-orange-500 hover:bg-orange-600">
          95% - Quase no limite
        </Badge>
      );
    }
    return null;
  };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {metrics.map((metric) => {
          const percent = getPercentage(metric.current, metric.max);
          return (
            <TooltipProvider key={metric.label}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs ${
                    percent >= 100 ? 'bg-red-50 border-red-200 text-red-700 animate-pulse' :
                    percent >= 95 ? 'bg-orange-50 border-orange-200 text-orange-700' :
                    percent >= 80 ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                    'bg-green-50 border-green-200 text-green-700'
                  }`}>
                    {metric.icon}
                    <span>{metric.current}/{metric.max}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{metric.label}: {metric.current} de {metric.max}{metric.unit || ''}</p>
                  <p className={getStatusColor(percent)}>{percent}% utilizado</p>
                  {percent >= 95 && percent < 100 && (
                    <p className="text-orange-600 font-medium">⚠️ Quase no limite!</p>
                  )}
                  {percent >= 100 && (
                    <p className="text-red-600 font-medium">🚫 Limite atingido!</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Consumo Atual
          </CardTitle>
          <div className="flex items-center gap-2">
            {planName && (
              <Badge variant="secondary" className="text-xs">
                {planName}
              </Badge>
            )}
            {useCustomLimits && (
              <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                Limites personalizados
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {metrics.map((metric) => {
          const percent = getPercentage(metric.current, metric.max);
          const alertBadge = getAlertBadge(percent);
          return (
            <div key={metric.label} className={`space-y-1 p-2 rounded-lg ${
              percent >= 100 ? 'bg-red-50/50 border border-red-200' :
              percent >= 95 ? 'bg-orange-50/50 border border-orange-200' :
              ''
            }`}>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  {metric.icon}
                  <span>{metric.label}</span>
                  {alertBadge}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${getStatusColor(percent)}`}>
                    {metric.current} / {metric.max}{metric.unit || ''}
                  </span>
                  {percent >= 100 && (
                    <AlertTriangle className="h-4 w-4 text-red-600 animate-pulse" />
                  )}
                  {percent >= 95 && percent < 100 && (
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                  )}
                  {percent >= 80 && percent < 95 && (
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  )}
                  {percent < 80 && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                </div>
              </div>
              <div className="relative">
                <Progress value={percent} className="h-2" />
                <div 
                  className={`absolute inset-0 h-2 rounded-full ${getProgressColor(percent)}`}
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  {percent}% utilizado
                </p>
                {percent >= 100 && (
                  <p className="text-xs text-red-600 font-medium">
                    Novas ações bloqueadas
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
