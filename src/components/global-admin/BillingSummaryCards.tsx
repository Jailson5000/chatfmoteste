import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  AlertCircle, 
  Clock, 
  CheckCircle2,
  DollarSign 
} from "lucide-react";

interface BillingSummary {
  totalOverdue: number;
  totalPending: number;
  totalAmountOverdue: number;
  totalAmountPending: number;
  totalActive: number;
}

interface BillingSummaryCardsProps {
  summary: BillingSummary;
}

export function BillingSummaryCards({ summary }: BillingSummaryCardsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Vencidas</CardTitle>
          <AlertCircle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-destructive">
            {summary.totalOverdue}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(summary.totalAmountOverdue)} em atraso
          </p>
        </CardContent>
      </Card>

      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
          <Clock className="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {summary.totalPending}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(summary.totalAmountPending)} a receber
          </p>
        </CardContent>
      </Card>

      <Card className="border-green-500/30 bg-green-500/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {summary.totalActive}
          </div>
          <p className="text-xs text-muted-foreground">
            empresas pagantes
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total em Aberto</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(summary.totalAmountOverdue + summary.totalAmountPending)}
          </div>
          <p className="text-xs text-muted-foreground">
            vencido + pendente
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
