import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Calendar, 
  Clock,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PaymentRecord {
  paymentId: string;
  customerId: string;
  companyId: string | null;
  companyName: string;
  planName: string;
  value: number;
  dueDate: string;
  daysOverdue: number;
  daysUntilDue: number;
  invoiceUrl: string | null;
  status: string;
}

interface UpcomingPaymentsListProps {
  payments: PaymentRecord[];
}

export function UpcomingPaymentsList({ payments }: UpcomingPaymentsListProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getUrgencyBadge = (daysUntilDue: number) => {
    if (daysUntilDue === 0) {
      return <Badge variant="destructive" className="text-xs">Hoje</Badge>;
    } else if (daysUntilDue === 1) {
      return <Badge variant="destructive" className="text-xs">Amanhã</Badge>;
    } else if (daysUntilDue <= 3) {
      return <Badge className="bg-yellow-500 text-white text-xs">{daysUntilDue} dias</Badge>;
    } else {
      return <Badge variant="secondary" className="text-xs">{daysUntilDue} dias</Badge>;
    }
  };

  if (payments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Calendar className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">
            Nenhum vencimento próximo
          </h3>
          <p className="text-sm text-muted-foreground mt-2">
            Não há cobranças vencendo nos próximos 7 dias.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          Próximos Vencimentos (7 dias)
        </CardTitle>
        <CardDescription>
          {payments.length} cobrança(s) vencendo em breve
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          <div className="space-y-3">
            {payments.map((payment) => (
              <div
                key={payment.paymentId}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{payment.companyName}</p>
                      <Badge variant="outline" className="text-xs">
                        {payment.planName}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Vence em: {format(new Date(payment.dueDate), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-semibold text-foreground">
                    {formatCurrency(payment.value)}
                  </span>
                  {getUrgencyBadge(payment.daysUntilDue)}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
