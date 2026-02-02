import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, CreditCard, Mail, MessageCircle, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SUPPORT_CONFIG, getWhatsAppSupportLink } from "@/lib/production-config";

interface CompanySuspendedProps {
  reason?: string | null;
  planName?: string | null;
  planPrice?: number | null;
}

export default function CompanySuspended({ reason, planName, planPrice }: CompanySuspendedProps) {
  const { signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handlePayNow = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-payment-link", {
        body: { billing_type: "monthly" },
      });

      if (error) throw error;

      if (data?.payment_url) {
        window.location.href = data.payment_url;
      } else {
        throw new Error("Link de pagamento não gerado");
      }
    } catch (err: any) {
      console.error("[CompanySuspended] Error generating payment link:", err);
      toast.error("Erro ao gerar link de pagamento. Entre em contato com o suporte.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleContactSupport = () => {
    window.open(`mailto:${SUPPORT_CONFIG.email}?subject=Acesso Suspenso - Regularização de Pagamento`, "_blank");
  };

  const handleWhatsAppContact = () => {
    const message = `Olá! Minha empresa está com acesso suspenso e gostaria de regularizar o pagamento.${planName ? `\n\nPlano: ${planName}` : ""}`;
    window.open(getWhatsAppSupportLink(message), "_blank");
  };

  const formattedPrice = planPrice 
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(planPrice)
    : "R$ 497,00";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <Lock className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-2xl">Acesso Suspenso Temporariamente</CardTitle>
          <CardDescription className="text-base">
            Identificamos uma pendência financeira na sua conta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reason && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 p-3">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-medium">{reason}</span>
              </div>
            </div>
          )}

          <p className="text-muted-foreground">
            {planName 
              ? `Regularize o pagamento do plano ${planName} para liberar o acesso.`
              : "Regularize seu pagamento para liberar o acesso ao sistema."
            }
          </p>

          {/* Pay Now Button - Primary CTA */}
          <Button 
            size="lg" 
            className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white" 
            onClick={handlePayNow}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CreditCard className="h-5 w-5" />
            )}
            Pagar Agora - {formattedPrice}/mês
          </Button>

          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="font-medium mb-2">Precisa de ajuda?</h4>
            <ul className="text-sm text-muted-foreground space-y-1 text-left">
              <li>• Efetue o pagamento para liberar o acesso imediatamente</li>
              <li>• Entre em contato conosco para verificar pendências</li>
              <li>• Fale com nosso suporte para opções de negociação</li>
            </ul>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button variant="outline" className="w-full gap-2" onClick={handleContactSupport}>
            <Mail className="h-4 w-4" />
            Falar com Suporte por Email
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={handleWhatsAppContact}>
            <MessageCircle className="h-4 w-4" />
            Falar pelo WhatsApp
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sair da conta
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
