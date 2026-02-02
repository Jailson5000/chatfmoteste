import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  AlertCircle, 
  Mail, 
  Ban, 
  FileText,
  Clock,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseDateLocal } from "@/lib/dateUtils";

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

interface BillingOverdueListProps {
  payments: PaymentRecord[];
  onSendReminder?: (paymentId: string, companyName: string) => void;
  onBlockCompany?: (companyId: string, companyName: string) => void;
  onViewInvoice?: (invoiceUrl: string) => void;
  loadingPaymentId?: string | null;
}

export function BillingOverdueList({ 
  payments, 
  onSendReminder, 
  onBlockCompany,
  onViewInvoice,
  loadingPaymentId
}: BillingOverdueListProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (payments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
            <AlertCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-medium text-green-600 dark:text-green-400">
            Nenhuma cobrança vencida!
          </h3>
          <p className="text-sm text-muted-foreground mt-2">
            Todas as empresas estão em dia com os pagamentos.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive" />
          Empresas Inadimplentes
        </CardTitle>
        <CardDescription>
          {payments.length} empresa(s) com cobrança(s) vencida(s)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {payments.map((payment) => (
              <div
                key={payment.paymentId}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 transition-colors gap-3"
              >
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{payment.companyName}</p>
                      <Badge variant="outline" className="text-xs">
                        {payment.planName}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <span className="font-semibold text-destructive">
                        {formatCurrency(payment.value)}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {payment.daysOverdue} dias em atraso
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Venceu em: {format(parseDateLocal(payment.dueDate) || new Date(), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  {onSendReminder && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSendReminder(payment.paymentId, payment.companyName)}
                      className="flex-1 sm:flex-none"
                      disabled={loadingPaymentId === payment.paymentId}
                    >
                      {loadingPaymentId === payment.paymentId ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4 mr-1" />
                      )}
                      {loadingPaymentId === payment.paymentId ? "Enviando..." : "Cobrar"}
                    </Button>
                  )}
                  {payment.companyId && onBlockCompany && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onBlockCompany(payment.companyId!, payment.companyName)}
                      className="text-destructive hover:text-destructive flex-1 sm:flex-none"
                    >
                      <Ban className="h-4 w-4 mr-1" />
                      Bloquear
                    </Button>
                  )}
                  {payment.invoiceUrl && onViewInvoice && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewInvoice(payment.invoiceUrl!)}
                      className="flex-1 sm:flex-none"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Fatura
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
