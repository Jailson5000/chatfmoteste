import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, CreditCard, Mail, MessageCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SUPPORT_CONFIG, getWhatsAppSupportLink } from "@/lib/production-config";

interface TrialExpiredProps {
  trialEndsAt?: string;
  planName?: string;
  planPrice?: number;
}

export default function TrialExpired({ trialEndsAt, planName, planPrice }: TrialExpiredProps) {
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
      console.error("[TrialExpired] Error generating payment link:", err);
      toast.error("Erro ao gerar link de pagamento. Entre em contato com o suporte.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleContactSupport = () => {
    window.open(`mailto:${SUPPORT_CONFIG.email}?subject=Upgrade de Plano - Trial Expirado`, "_blank");
  };

  const handleWhatsAppContact = () => {
    const message = `Olá! Meu período de trial expirou e gostaria de contratar um plano.${planName ? `\n\nPlano: ${planName}` : ""}`;
    window.open(getWhatsAppSupportLink(message), "_blank");
  };

  const formattedPrice = planPrice 
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(planPrice)
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <Clock className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-2xl">Período de Teste Encerrado</CardTitle>
          <CardDescription className="text-base">
            {trialEndsAt 
              ? `Seu trial terminou em ${format(new Date(trialEndsAt), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`
              : "Seu período de teste gratuito terminou"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {planName 
              ? `Para continuar usando o MiauChat com o plano ${planName}, efetue o pagamento.`
              : "Para continuar usando o MiauChat, escolha um plano e efetue o pagamento."
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
            {formattedPrice ? `Pagar Agora - ${formattedPrice}/mês` : "Pagar Agora"}
          </Button>

          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="font-medium mb-2">O que você pode fazer:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 text-left">
              <li>• Efetuar o pagamento para liberar o acesso imediatamente</li>
              <li>• Entrar em contato com nosso suporte para dúvidas</li>
              <li>• Escolher outro plano se preferir</li>
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
