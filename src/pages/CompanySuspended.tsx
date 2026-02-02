import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, CreditCard, Mail, MessageCircle, Loader2 } from "lucide-react";
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
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <Lock className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-2xl">Conta Suspensa</CardTitle>
          <CardDescription className="text-base">
            Para voltar a usar o sistema, regularize seu pagamento clicando no botão abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reason && (
            <div className="rounded-lg border border-muted bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground">{reason}</p>
            </div>
          )}

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
            Regularizar Agora - {formattedPrice}/mês
          </Button>

          <p className="text-sm text-muted-foreground">
            Dúvidas? Fale com nosso suporte.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button variant="outline" className="w-full gap-2" onClick={handleContactSupport}>
            <Mail className="h-4 w-4" />
            Suporte por Email
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
