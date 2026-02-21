import { Card, CardContent } from "@/components/ui/card";
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  MessagesSquare,
  Activity,
  Archive,
} from "lucide-react";
import { MessageMetrics } from "@/hooks/useDashboardMetrics";

interface MessageMetricsCardsProps {
  metrics: MessageMetrics;
  isLoading?: boolean;
}

export function MessageMetricsCards({ metrics, isLoading }: MessageMetricsCardsProps) {
  const cards = [
    {
      label: "Mensagens Recebidas",
      value: metrics.totalReceived,
      icon: ArrowDownLeft,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Mensagens Enviadas",
      value: metrics.totalSent,
      icon: ArrowUpRight,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Total de Conversas",
      value: metrics.totalConversations,
      icon: MessagesSquare,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      label: "Conversas Ativas",
      value: metrics.activeConversations,
      icon: Activity,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      label: "Conversas Arquivadas",
      value: metrics.archivedConversations,
      icon: Archive,
      color: "text-gray-500",
      bgColor: "bg-gray-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <Card key={card.label} className="bg-card border-border overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-bold">
                  {isLoading ? (
                    <span className="animate-pulse">--</span>
                  ) : (
                    card.value.toLocaleString("pt-BR")
                  )}
                </p>
              </div>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
