import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, ArrowDownLeft, ArrowUpRight, MessagesSquare } from "lucide-react";
import { AttendantMetrics } from "@/hooks/useDashboardMetrics";

interface AttendantPerformanceTableProps {
  attendants: AttendantMetrics[];
  isLoading?: boolean;
}

export function AttendantPerformanceTable({ attendants, isLoading }: AttendantPerformanceTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Desempenho por Atendente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Carregando...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (attendants.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Desempenho por Atendente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
            <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm">Nenhum dado disponível</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Desempenho por Atendente
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground border-b border-border pb-2 mb-2">
            <span>Atendente</span>
            <span className="text-center">Conversas</span>
            <span className="text-center">Recebidas</span>
            <span className="text-center">Enviadas</span>
          </div>

          {/* Rows */}
          {attendants.slice(0, 8).map((attendant) => (
            <div
              key={attendant.id}
              className="grid grid-cols-4 gap-2 items-center py-2 hover:bg-accent/50 rounded-md px-1 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarImage src={attendant.avatarUrl || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {attendant.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm truncate">{attendant.name}</span>
              </div>
              <div className="flex justify-center">
                <Badge variant="secondary" className="text-xs gap-1">
                  <MessagesSquare className="h-3 w-3" />
                  {attendant.conversationsHandled}
                </Badge>
              </div>
              <div className="flex justify-center">
                <Badge variant="outline" className="text-xs gap-1 text-blue-500 border-blue-500/30">
                  <ArrowDownLeft className="h-3 w-3" />
                  {attendant.messagesReceived}
                </Badge>
              </div>
              <div className="flex justify-center">
                <Badge variant="outline" className="text-xs gap-1 text-green-500 border-green-500/30">
                  <ArrowUpRight className="h-3 w-3" />
                  {attendant.messagesSent}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
