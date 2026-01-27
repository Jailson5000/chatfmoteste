import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, CreditCard, Mail, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TrialExpiredProps {
  trialEndsAt?: string;
  planName?: string;
}

export default function TrialExpired({ trialEndsAt, planName }: TrialExpiredProps) {
  const { signOut } = useAuth();

  const handleContactSupport = () => {
    window.open("mailto:suporte@miauchat.com.br?subject=Upgrade de Plano - Trial Expirado", "_blank");
  };

  const handleWhatsAppContact = () => {
    window.open("https://wa.me/5511999999999?text=Olá! Meu período de trial expirou e gostaria de contratar um plano.", "_blank");
  };

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

          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="font-medium mb-2">O que você pode fazer:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 text-left">
              <li>• Entrar em contato com nosso suporte</li>
              <li>• Escolher o plano ideal para seu negócio</li>
              <li>• Efetuar o pagamento para liberar o acesso</li>
            </ul>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button className="w-full gap-2" size="lg" onClick={handleContactSupport}>
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
